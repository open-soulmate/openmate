"""
OpenSoul — 项目记忆

管理代码库文件索引、依赖图谱、核心组件识别。
支持增量刷新，避免每次全量扫描。
"""

import ast
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from soul.data_models import FileInfo, ImpactAnalysis

logger = logging.getLogger(__name__)

# 支持的语言后缀
LANG_MAP = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".css": "css",
    ".html": "html",
    ".sh": "shell",
}

# 忽略的目录
IGNORE_DIRS = {
    "node_modules", ".next", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".hermes", ".cache", "data",
}

# 核心文件阈值：被依赖次数排名前N%的文件
CORE_FILE_PERCENTILE = 0.9


class ProjectMemory:
    """项目记忆：文件索引、依赖图谱、核心组件识别"""

    def __init__(self, repo_root: str, cache_path: str = "data/project_memory.json"):
        self.repo_root = Path(repo_root)
        self.cache_path = Path(cache_path)
        self.file_index: dict[str, FileInfo] = {}
        self.dependency_graph: dict[str, list[str]] = {}  # file → [依赖它的文件]
        self.import_graph: dict[str, list[str]] = {}  # file → [它依赖的文件]
        self.core_files: list[str] = []
        self._last_scan: Optional[datetime] = None
        self._build_index()

    def _build_index(self):
        """全量扫描项目，初始化文件索引与依赖图"""
        logger.info("扫描项目: %s", self.repo_root)
        start = datetime.now()

        for root, dirs, files in os.walk(self.repo_root):
            # 过滤忽略目录
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for fname in files:
                fpath = Path(root) / fname
                ext = fpath.suffix.lower()
                if ext in LANG_MAP:
                    rel_path = str(fpath.relative_to(self.repo_root))
                    try:
                        stat = fpath.stat()
                        self.file_index[rel_path] = FileInfo(
                            path=rel_path,
                            language=LANG_MAP[ext],
                            lines=self._count_lines(fpath),
                            size_bytes=stat.st_size,
                            last_modified=datetime.fromtimestamp(stat.st_mtime),
                        )
                    except Exception as e:
                        logger.debug("跳过文件 %s: %s", rel_path, e)

        # 构建依赖图
        self._build_dependency_graph()
        # 识别核心文件
        self._identify_core_files()
        self._last_scan = start

        elapsed = (datetime.now() - start).total_seconds()
        logger.info("扫描完成: %d个文件, %d个核心文件, %.1fs",
                     len(self.file_index), len(self.core_files), elapsed)

    def _count_lines(self, path: Path) -> int:
        """统计文件行数"""
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return sum(1 for _ in f)
        except Exception:
            return 0

    def _build_dependency_graph(self):
        """构建依赖图：解析import/require关系"""
        for rel_path, info in self.file_index.items():
            full_path = self.repo_root / rel_path
            imports = self._extract_imports(full_path, info.language)
            self.import_graph[rel_path] = imports

            # 反向构建dependency_graph（谁依赖我）
            for imp in imports:
                if imp not in self.dependency_graph:
                    self.dependency_graph[imp] = []
                if rel_path not in self.dependency_graph[imp]:
                    self.dependency_graph[imp].append(rel_path)

    def _extract_imports(self, path: Path, language: str) -> list[str]:
        """提取文件中的import/require依赖"""
        imports = []
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return imports

        if language == "python":
            imports = self._extract_python_imports(path, content)
        elif language in ("typescript", "javascript"):
            imports = self._extract_js_imports(path, content)

        return imports

    def _extract_python_imports(self, path: Path, content: str) -> list[str]:
        """Python import解析"""
        imports = []
        try:
            tree = ast.parse(content, filename=str(path))
        except SyntaxError:
            return imports

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    resolved = self._resolve_python_import(alias.name, path)
                    if resolved:
                        imports.append(resolved)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    resolved = self._resolve_python_import(node.module, path)
                    if resolved:
                        imports.append(resolved)
        return imports

    def _resolve_python_import(self, module_name: str, from_path: Path) -> Optional[str]:
        """将Python模块名解析为项目内相对路径"""
        # 相对导入
        parts = module_name.split(".")
        candidate = from_path.parent / "/".join(parts)
        for suffix in [".py", "/__init__.py"]:
            resolved = candidate.with_suffix(suffix) if suffix.startswith(".") else candidate / suffix.lstrip("/")
            rel = resolved.relative_to(self.repo_root) if resolved.exists() else None
            if rel and str(rel) in self.file_index:
                return str(rel)

        # 绝对导入（假设从项目根开始）
        candidate = self.repo_root / "/".join(parts)
        for suffix in [".py", "/__init__.py"]:
            if suffix.startswith("."):
                resolved = candidate.with_suffix(suffix)
            else:
                resolved = candidate / suffix.lstrip("/")
            try:
                rel = resolved.relative_to(self.repo_root)
                if str(rel) in self.file_index:
                    return str(rel)
            except ValueError:
                continue
        return None

    def _extract_js_imports(self, path: Path, content: str) -> list[str]:
        """JS/TS import/require解析"""
        imports = []
        # import ... from '...'
        for m in re.finditer(r'''(?:import|from)\s+.*?['"]([^'"]+)['"]''', content):
            resolved = self._resolve_js_import(m.group(1), path)
            if resolved:
                imports.append(resolved)
        # require('...')
        for m in re.finditer(r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)''', content):
            resolved = self._resolve_js_import(m.group(1), path)
            if resolved:
                imports.append(resolved)
        return imports

    def _resolve_js_import(self, import_path: str, from_path: Path) -> Optional[str]:
        """将JS/TS import路径解析为项目内相对路径"""
        if not import_path.startswith("."):
            return None  # 外部依赖

        candidate = (from_path.parent / import_path).resolve()
        # 尝试多种后缀
        for suffix in [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]:
            test = candidate.with_suffix(suffix) if "." in suffix and "/" not in suffix else candidate.parent / (candidate.name + suffix)
            try:
                rel = test.relative_to(self.repo_root)
                if str(rel) in self.file_index:
                    return str(rel)
            except ValueError:
                continue
        return None

    def _identify_core_files(self):
        """识别核心文件：被依赖次数排名前(1-PERCENTILE)的文件"""
        dep_counts = [(f, len(deps)) for f, deps in self.dependency_graph.items()]
        dep_counts.sort(key=lambda x: x[1], reverse=True)

        # 排名前10%的文件是核心文件
        cutoff = max(1, int(len(dep_counts) * (1 - CORE_FILE_PERCENTILE)))
        self.core_files = [f for f, _ in dep_counts[:cutoff] if _ > 0]

        # 标记
        for path in self.core_files:
            if path in self.file_index:
                self.file_index[path].is_core = True

    async def refresh_incremental(self):
        """增量刷新：仅扫描自上次以来发生变更的文件"""
        if not self._last_scan:
            self._build_index()
            return

        changed_files = []
        for rel_path, info in self.file_index.items():
            full_path = self.repo_root / rel_path
            try:
                stat = full_path.stat()
                mod_time = datetime.fromtimestamp(stat.st_mtime)
                if mod_time > info.last_modified:
                    # 更新索引
                    info.lines = self._count_lines(full_path)
                    info.size_bytes = stat.st_size
                    info.last_modified = mod_time
                    changed_files.append(rel_path)
            except FileNotFoundError:
                # 文件被删除
                del self.file_index[rel_path]
                changed_files.append(rel_path)

        if changed_files:
            # 重新解析变更文件的依赖关系
            for rel_path in changed_files:
                if rel_path in self.file_index:
                    info = self.file_index[rel_path]
                    full_path = self.repo_root / rel_path
                    new_imports = self._extract_imports(full_path, info.language)
                    old_imports = self.import_graph.get(rel_path, [])
                    self.import_graph[rel_path] = new_imports

                    # 更新反向依赖图
                    for imp in set(old_imports) - set(new_imports):
                        if imp in self.dependency_graph and rel_path in self.dependency_graph[imp]:
                            self.dependency_graph[imp].remove(rel_path)
                    for imp in set(new_imports) - set(old_imports):
                        if imp not in self.dependency_graph:
                            self.dependency_graph[imp] = []
                        if rel_path not in self.dependency_graph[imp]:
                            self.dependency_graph[imp].append(rel_path)

            self._identify_core_files()
            logger.info("增量刷新完成: %d个文件变更", len(changed_files))

        self._last_scan = datetime.now()

    def is_core_file(self, path: str) -> bool:
        return path in self.core_files

    def get_dependents(self, path: str) -> list[str]:
        """哪些文件依赖这个文件？"""
        return self.dependency_graph.get(path, [])

    def get_imports(self, path: str) -> list[str]:
        """这个文件依赖哪些文件？"""
        return self.import_graph.get(path, [])

    def get_impact(self, path: str) -> ImpactAnalysis:
        """评估修改此文件的影响范围"""
        direct = self.get_dependents(path)
        indirect = self._transitive_deps(path)

        if len(direct) > 10:
            level = "critical"
        elif len(direct) > 5:
            level = "high"
        elif len(direct) > 2:
            level = "medium"
        else:
            level = "low"

        return ImpactAnalysis(
            direct_impact=direct,
            indirect_impact=indirect,
            risk_level=level,
        )

    def _transitive_deps(self, path: str) -> list[str]:
        """传递依赖：A依赖B，B依赖C → 修改C间接影响A"""
        visited = set()
        queue = self.get_dependents(path).copy()
        while queue:
            f = queue.pop(0)
            if f not in visited:
                visited.add(f)
                queue.extend(self.get_dependents(f))
        return list(visited)

    def get_stats(self) -> dict:
        """项目记忆统计"""
        return {
            "total_files": len(self.file_index),
            "core_files": len(self.core_files),
            "total_dependencies": sum(len(d) for d in self.dependency_graph.values()),
            "last_scan": self._last_scan.isoformat() if self._last_scan else None,
        }

    def save_cache(self):
        """保存缓存到磁盘"""
        data = {
            "files": {k: {"language": v.language, "lines": v.lines, "is_core": v.is_core}
                      for k, v in self.file_index.items()},
            "dependency_graph": self.dependency_graph,
            "import_graph": self.import_graph,
            "core_files": self.core_files,
            "last_scan": self._last_scan.isoformat() if self._last_scan else None,
        }
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def load_cache(self) -> bool:
        """从磁盘加载缓存"""
        if not self.cache_path.exists():
            return False
        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.dependency_graph = data.get("dependency_graph", {})
            self.import_graph = data.get("import_graph", {})
            self.core_files = data.get("core_files", [])
            return True
        except Exception as e:
            logger.warning("加载缓存失败: %s", e)
            return False
