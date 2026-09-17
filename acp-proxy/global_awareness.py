"""全局感知模块 — 让evo拥有系统级视野

解决"只见树木不见森林"问题：
1. 模块依赖图：AST解析import关系，自动发现新模块
2. 运行时健康：扫描最近日志/错误，标记热点模块
3. 进化历史：git log分析最近改动，避免重复
4. 技术债务：扫描TODO/FIXME/HACK标记
5. 契约关系：从contract_registry读取保护文件

每次进化前实时计算，不依赖人工维护的静态map。
"""
import ast
import json
import logging
import os
import re
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("global-awareness")

# 配置
SCAN_DIRS = ["src", "acp-proxy"]  # 要扫描的目录
SCAN_EXTENSIONS = {".py", ".tsx", ".ts", ".js"}
GIT_LOG_LIMIT = 30  # 分析最近N个commit
ERROR_LOG_LIMIT = 50  # 分析最近N条错误日志


class GlobalAwareness:
    """全局感知器"""
    
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self._cache: dict = {}
        self._cache_time: float = 0
        self._cache_ttl: float = 300  # 5分钟缓存
    
    def get_system_state(self, force_refresh: bool = False) -> dict:
        """获取系统全局状态（带缓存）"""
        now = time.time()
        if not force_refresh and self._cache and (now - self._cache_time) < self._cache_ttl:
            return self._cache
        
        state = {
            "timestamp": now,
            "modules": self._scan_modules(),
            "dependencies": self._analyze_dependencies(),
            "recent_changes": self._git_recent_changes(),
            "tech_debt": self._scan_tech_debt(),
            "error_hotspots": self._scan_error_hotspots(),
            "contracts": self._load_contracts(),
        }
        
        self._cache = state
        self._cache_time = now
        return state
    
    def suggest_target(self, state: dict | None = None) -> dict:
        """基于全局状态推荐下一个改进目标
        
        优先级：
        1. 错误热点（最近频繁出错的模块）
        2. 技术债务（TODO/FIXME最多的地方）
        3. 孤立模块（很少被改动但可能存在隐患）
        4. 依赖中心（被依赖最多的核心模块，改动需谨慎）
        """
        if state is None:
            state = self.get_system_state()
        
        suggestions = []
        
        # 1. 错误热点
        for module, count in state.get("error_hotspots", {}).items():
            if count >= 3:
                suggestions.append({
                    "priority": "P0",
                    "target": module,
                    "reason": f"错误热点：最近{count}次出错",
                    "category": "bug_fix",
                })
        
        # 2. 技术债务
        debt_by_module = defaultdict(int)
        for item in state.get("tech_debt", []):
            debt_by_module[item["file"]] += 1
        
        for module, count in sorted(debt_by_module.items(), key=lambda x: -x[1])[:5]:
            if count >= 2:
                suggestions.append({
                    "priority": "P1",
                    "target": module,
                    "reason": f"技术债务：{count}个TODO/FIXME",
                    "category": "tech_debt",
                })
        
        # 3. 依赖中心（被依赖最多的模块，需要关注）
        dep_count = defaultdict(int)
        for module, deps in state.get("dependencies", {}).items():
            for dep in deps:
                dep_count[dep] += 1
        
        # 找出被依赖最多但最近没改过的模块
        recent_files = {c.get("file", "") for c in state.get("recent_changes", [])}
        for module, count in sorted(dep_count.items(), key=lambda x: -x[1])[:3]:
            if count >= 3 and module not in recent_files:
                suggestions.append({
                    "priority": "P2",
                    "target": module,
                    "reason": f"核心模块：被{count}个模块依赖，近期未改动",
                    "category": "core_review",
                })
        
        # 按优先级排序
        priority_order = {"P0": 0, "P1": 1, "P2": 2}
        suggestions.sort(key=lambda x: priority_order.get(x["priority"], 99))
        
        return {
            "suggestions": suggestions[:10],  # 最多返回10个
            "total_modules": len(state.get("modules", [])),
            "total_dependencies": sum(len(v) for v in state.get("dependencies", {}).values()),
        }
    
    def update_after_change(self, changed_files: list[str], result: dict):
        """进化后更新全局状态缓存"""
        # 清除缓存，下次get_system_state会重新扫描
        self._cache = {}
        self._cache_time = 0
        
        # 记录到进化历史
        history_file = self.repo_root / "acp-proxy" / "data" / "evolution_history.json"
        history_file.parent.mkdir(parents=True, exist_ok=True)
        
        history = []
        if history_file.exists():
            try:
                history = json.loads(history_file.read_text())
            except:
                history = []
        
        history.append({
            "timestamp": time.time(),
            "changed_files": changed_files,
            "success": result.get("success", False),
            "round_id": result.get("round_id", ""),
        })
        
        # 只保留最近100条
        history = history[-100:]
        history_file.write_text(json.dumps(history, indent=2, ensure_ascii=False))
    
    def get_evolution_history(self, limit: int = 20) -> list[dict]:
        """获取进化历史"""
        history_file = self.repo_root / "acp-proxy" / "data" / "evolution_history.json"
        if not history_file.exists():
            return []
        
        try:
            history = json.loads(history_file.read_text())
            return history[-limit:]
        except:
            return []
    
    # ── 内部方法 ──
    
    def _scan_modules(self) -> list[dict]:
        """扫描所有模块文件"""
        modules = []
        
        for scan_dir in SCAN_DIRS:
            dir_path = self.repo_root / scan_dir
            if not dir_path.exists():
                continue
            
            for ext in SCAN_EXTENSIONS:
                for file_path in dir_path.rglob(f"*{ext}"):
                    # 跳过node_modules等
                    if any(skip in str(file_path) for skip in ["node_modules", ".next", "__pycache__", ".git"]):
                        continue
                    
                    rel_path = file_path.relative_to(self.repo_root)
                    modules.append({
                        "path": str(rel_path),
                        "type": ext.lstrip("."),
                        "size": file_path.stat().st_size,
                        "modified": file_path.stat().st_mtime,
                    })
        
        return modules
    
    def _analyze_dependencies(self) -> dict[str, list[str]]:
        """分析模块间的依赖关系（Python用AST，JS/TS用正则）"""
        deps = defaultdict(list)
        
        for scan_dir in SCAN_DIRS:
            dir_path = self.repo_root / scan_dir
            if not dir_path.exists():
                continue
            
            # Python文件用AST解析
            for py_file in dir_path.rglob("*.py"):
                if any(skip in str(py_file) for skip in ["__pycache__", ".git"]):
                    continue
                
                try:
                    content = py_file.read_text()
                    tree = ast.parse(content)
                    
                    rel_path = str(py_file.relative_to(self.repo_root))
                    
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                deps[rel_path].append(alias.name)
                        elif isinstance(node, ast.ImportFrom):
                            if node.module:
                                deps[rel_path].append(node.module)
                except:
                    continue
            
            # JS/TS文件用正则匹配import
            for ext in [".tsx", ".ts", ".js"]:
                for js_file in dir_path.rglob(f"*{ext}"):
                    if any(skip in str(js_file) for skip in ["node_modules", ".next"]):
                        continue
                    
                    try:
                        content = js_file.read_text()
                        rel_path = str(js_file.relative_to(self.repo_root))
                        
                        # 匹配 import ... from '...'
                        import_pattern = r"import\s+.*?from\s+['\"]([^'\"]+)['\"]"
                        for match in re.finditer(import_pattern, content):
                            deps[rel_path].append(match.group(1))
                    except:
                        continue
        
        return dict(deps)
    
    def _git_recent_changes(self) -> list[dict]:
        """分析git最近改动"""
        try:
            result = subprocess.run(
                ["git", "log", f"-{GIT_LOG_LIMIT}", "--name-only", "--pretty=format:%H|%s|%at"],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                timeout=10,
            )
            
            if result.returncode != 0:
                return []
            
            changes = []
            current_commit = None
            
            for line in result.stdout.split("\n"):
                if "|" in line and current_commit is None:
                    parts = line.split("|", 2)
                    if len(parts) == 3:
                        current_commit = {
                            "hash": parts[0][:8],
                            "message": parts[1][:100],
                            "timestamp": int(parts[2]),
                            "files": [],
                        }
                elif line.strip() and current_commit:
                    current_commit["files"].append(line.strip())
                elif not line.strip() and current_commit:
                    changes.append(current_commit)
                    current_commit = None
            
            if current_commit:
                changes.append(current_commit)
            
            return changes
        except:
            return []
    
    def _scan_tech_debt(self) -> list[dict]:
        """扫描TODO/FIXME/HACK标记"""
        debt = []
        patterns = [
            (r"#\s*TODO", "TODO"),
            (r"#\s*FIXME", "FIXME"),
            (r"#\s*HACK", "HACK"),
            (r"#\s*XXX", "XXX"),
            (r"//\s*TODO", "TODO"),
            (r"//\s*FIXME", "FIXME"),
        ]
        
        for scan_dir in SCAN_DIRS:
            dir_path = self.repo_root / scan_dir
            if not dir_path.exists():
                continue
            
            for ext in SCAN_EXTENSIONS:
                for file_path in dir_path.rglob(f"*{ext}"):
                    if any(skip in str(file_path) for skip in ["node_modules", ".next", "__pycache__", ".git"]):
                        continue
                    
                    try:
                        content = file_path.read_text()
                        rel_path = str(file_path.relative_to(self.repo_root))
                        
                        for pattern, debt_type in patterns:
                            for i, line in enumerate(content.split("\n"), 1):
                                if re.search(pattern, line):
                                    debt.append({
                                        "file": rel_path,
                                        "line": i,
                                        "type": debt_type,
                                        "content": line.strip()[:100],
                                    })
                    except:
                        continue
        
        return debt
    
    def _scan_error_hotspots(self) -> dict[str, int]:
        """扫描错误日志，统计出错热点"""
        hotspots = defaultdict(int)
        
        # 检查acp-proxy的日志
        log_dir = self.repo_root / "acp-proxy" / "logs"
        if log_dir.exists():
            for log_file in log_dir.glob("*.log"):
                try:
                    # 只读最后1000行
                    with open(log_file, "r") as f:
                        lines = f.readlines()[-1000:]
                    
                    for line in lines:
                        if "ERROR" in line or "Traceback" in line:
                            # 提取文件名
                            file_match = re.search(r'File "([^"]+)"', line)
                            if file_match:
                                hotspots[file_match.group(1)] += 1
                except:
                    continue
        
        return dict(hotspots)
    
    def _load_contracts(self) -> list[str]:
        """从contract_registry加载保护文件"""
        try:
            from contract_registry import get_protected_files
            return list(get_protected_files())
        except:
            return []


# 全局单例
_global_awareness: GlobalAwareness | None = None

def get_global_awareness(repo_root: Path) -> GlobalAwareness:
    """获取全局感知器单例"""
    global _global_awareness
    if _global_awareness is None:
        _global_awareness = GlobalAwareness(repo_root)
    return _global_awareness
