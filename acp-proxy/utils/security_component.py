"""
安全组件 — 前置+后置双点防护

架构：
    pre_check(task) → LLM调用 → post_check(baseline, output) → atomic_write
         ↓                              ↓
     基线快照                        行数/语法校验
     Git备份                        原子写入
     风险预检                        回滚能力

使用方式：
    from utils.security_component import SecurityComponent
    
    security = SecurityComponent(repo_root="/path/to/repo")
    
    # 前置：LLM调用之前
    ctx = security.pre_check(target_file, task_type)
    if not ctx.passed:
        return ctx.msg
    
    # LLM调用
    llm_output = await llm_call(...)
    
    # 后置：LLM返回后，写文件前
    result = security.post_check(ctx, llm_output)
    if not result.passed:
        ctx.rollback()
        return result.msg
    
    # 校验通过，原子写入
    security.atomic_write(ctx.file_path, llm_output)
"""

import hashlib
import json
import logging
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


# ── 常量 ──────────────────────────────────────────────

LINE_REDUCE_THRESHOLD = 0.3  # 新文件行数 < 原文件30% 则阻断
MAX_FILE_SIZE_MB = 10  # 最大文件大小限制
MAX_FILE_LINES = 5000  # 最大文件行数（超过强制patch模式）
HISTORY_DIR = ".evolution_history"

# 禁止修改的核心文件黑名单
BLACKLISTED_FILES = {
    "package.json",
    "tsconfig.json",
    ".env",
    ".env.local",
    "docker-compose.yml",
    "Dockerfile",
}


# ── 数据结构 ──────────────────────────────────────────

@dataclass
class FileBaseline:
    """文件基线信息（前置阶段保存）"""
    path: str
    exists: bool
    content: str
    lines: int
    sha256: str
    size_bytes: int
    history_path: str = ""  # 编辑历史备份路径
    git_committed: bool = False  # 是否已做git快照


@dataclass
class PreCheckResult:
    """前置校验结果"""
    passed: bool
    msg: str
    baseline: FileBaseline | None = None
    force_patch_mode: bool = False  # 是否强制patch模式


@dataclass
class PostCheckResult:
    """后置校验结果"""
    passed: bool
    msg: str
    new_lines: int = 0
    new_sha256: str = ""
    syntax_errors: list[str] = field(default_factory=list)


@dataclass
class SecurityContext:
    """安全上下文（贯穿整个流程）"""
    baseline: FileBaseline
    force_patch_mode: bool = False
    task_type: str = ""  # "new_file" | "modify" | "delete"
    
    def rollback(self):
        """回滚到基线"""
        if not self.baseline.exists:
            # 原文件不存在，删除新建的文件
            if os.path.exists(self.baseline.path):
                os.remove(self.baseline.path)
                logger.info(f"Rollback: deleted {self.baseline.path}")
        else:
            # 恢复原文件内容
            with open(self.baseline.path, "w", encoding="utf-8") as f:
                f.write(self.baseline.content)
            logger.info(f"Rollback: restored {self.baseline.path}")
        
        # 从git恢复（如果做了快照）
        if self.baseline.git_committed:
            try:
                subprocess.run(
                    ["git", "checkout", "HEAD", "--", self.baseline.path],
                    cwd=str(Path(self.baseline.path).parent),
                    capture_output=True, timeout=10,
                )
                logger.info(f"Rollback: git restored {self.baseline.path}")
            except Exception as e:
                logger.error(f"Git rollback failed: {e}")


# ── 安全组件 ──────────────────────────────────────────

class SecurityComponent:
    """安全组件 — 前置+后置双点防护"""
    
    def __init__(self, repo_root: str = "."):
        self.repo_root = Path(repo_root)
    
    def pre_check(self, target_file: str, task_type: str = "modify") -> PreCheckResult:
        """前置校验：LLM调用之前
        
        执行：
        1. 文件黑名单检查
        2. 文件大小/行数检查（决定是否强制patch模式）
        3. 基线快照（content, lines, sha256）
        4. 编辑历史备份
        5. Git临时快照
        """
        file_path = self.repo_root / target_file
        
        # 1. 黑名单检查
        if os.path.basename(target_file) in BLACKLISTED_FILES:
            return PreCheckResult(
                passed=False,
                msg=f"BLOCKED: 禁止修改核心文件 {target_file}",
            )
        
        # 2. 读取原文件基线
        exists = file_path.exists()
        content = ""
        lines = 0
        sha256 = ""
        size_bytes = 0
        
        if exists:
            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
                lines = len(content.splitlines())
                sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
                size_bytes = len(content.encode("utf-8"))
            except Exception as e:
                return PreCheckResult(
                    passed=False,
                    msg=f"Failed to read file: {e}",
                )
            
            # 文件大小限制
            size_mb = size_bytes / (1024 * 1024)
            if size_mb > MAX_FILE_SIZE_MB:
                return PreCheckResult(
                    passed=False,
                    msg=f"BLOCKED: 文件过大 {size_mb:.1f}MB > {MAX_FILE_SIZE_MB}MB",
                )
        
        # 3. 决定是否强制patch模式
        force_patch = exists and lines > MAX_FILE_LINES
        
        # 4. 保存基线
        baseline = FileBaseline(
            path=str(file_path),
            exists=exists,
            content=content,
            lines=lines,
            sha256=sha256,
            size_bytes=size_bytes,
        )
        
        # 5. 编辑历史备份
        if exists and content:
            history_path = self._save_history(content, target_file)
            baseline.history_path = history_path
        
        # 6. Git临时快照
        if exists:
            git_ok = self._git_snapshot(target_file)
            baseline.git_committed = git_ok
        
        logger.info(
            f"PreCheck passed: {target_file} "
            f"exists={exists} lines={lines} "
            f"force_patch={force_patch} "
            f"sha256={sha256[:16]}..."
        )
        
        return PreCheckResult(
            passed=True,
            msg="Pre-check passed",
            baseline=baseline,
            force_patch_mode=force_patch,
        )
    
    def post_check(self, ctx: SecurityContext, llm_output: str) -> PostCheckResult:
        """后置校验：LLM返回后，写文件之前
        
        执行：
        1. 行数锐减校验
        2. 哈希差异校验
        3. 语法检查（Python/JS/TS/JSON）
        4. 原子写入控制
        """
        baseline = ctx.baseline
        new_lines = len(llm_output.splitlines())
        new_sha256 = hashlib.sha256(llm_output.encode("utf-8")).hexdigest()
        
        # 1. 行数锐减校验（仅修改已有文件时）
        if baseline.exists and baseline.lines > 50:
            if new_lines < baseline.lines * LINE_REDUCE_THRESHOLD:
                reason = (
                    f"BLOCKED: 文件行数锐减 {baseline.lines}->{new_lines} "
                    f"({new_lines/max(baseline.lines,1):.0%}), 疑似LLM输出截断"
                )
                logger.warning(reason)
                return PostCheckResult(
                    passed=False,
                    msg=reason,
                    new_lines=new_lines,
                    new_sha256=new_sha256,
                )
        
        # 2. 内容未变化校验
        if baseline.exists and new_sha256 == baseline.sha256:
            logger.info(f"PostCheck: content unchanged for {baseline.path}")
            return PostCheckResult(
                passed=True,
                msg="Content unchanged (no-op)",
                new_lines=new_lines,
                new_sha256=new_sha256,
            )
        
        # 3. 语法检查
        syntax_errors = self._check_syntax(llm_output, baseline.path)
        if syntax_errors:
            logger.warning(f"PostCheck: syntax errors: {syntax_errors}")
            return PostCheckResult(
                passed=False,
                msg=f"Syntax errors: {syntax_errors}",
                new_lines=new_lines,
                new_sha256=new_sha256,
                syntax_errors=syntax_errors,
            )
        
        # 4. 审计日志
        self._audit_log(baseline, llm_output, new_lines, new_sha256)
        
        logger.info(
            f"PostCheck passed: {baseline.path} "
            f"old_lines={baseline.lines} new_lines={new_lines} "
            f"ratio={new_lines/max(baseline.lines,1):.2f}"
        )
        
        return PostCheckResult(
            passed=True,
            msg="Post-check passed",
            new_lines=new_lines,
            new_sha256=new_sha256,
        )
    
    def atomic_write(self, path: str, content: str, encoding: str = "utf-8") -> bool:
        """原子写入：tempfile + os.replace"""
        file_path = Path(path)
        tmp_path = None
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", encoding=encoding,
                dir=str(file_path.parent),
                suffix=".tmp",
                delete=False,
            ) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            os.replace(tmp_path, str(file_path))
            return True
        except Exception as e:
            logger.error(f"Atomic write failed: {path} - {e}")
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            return False
    
    # ── 内部方法 ──────────────────────────────────────
    
    def _save_history(self, content: str, target: str) -> str:
        """保存编辑前内容到历史目录"""
        try:
            history_dir = self.repo_root / HISTORY_DIR
            history_dir.mkdir(exist_ok=True)
            safe_name = target.replace("/", "_").replace("\\", "_")
            history_file = history_dir / f"{safe_name}_{int(time.time())}.bak"
            history_file.write_text(content, encoding="utf-8")
            logger.info(f"Edit history saved: {history_file}")
            return str(history_file)
        except Exception as e:
            logger.warning(f"Failed to save edit history: {e}")
            return ""
    
    def _git_snapshot(self, target_file: str) -> bool:
        """Git临时快照"""
        try:
            subprocess.run(
                ["git", "add", target_file],
                cwd=str(self.repo_root),
                capture_output=True, timeout=10,
            )
            result = subprocess.run(
                ["git", "commit", "-m", f"[security] Pre-edit snapshot: {target_file}"],
                cwd=str(self.repo_root),
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                logger.info(f"Git snapshot committed: {target_file}")
                return True
            else:
                logger.info(f"Git snapshot: nothing to commit for {target_file}")
                return False
        except Exception as e:
            logger.warning(f"Git snapshot failed: {e}")
            return False
    
    def _check_syntax(self, content: str, target: str) -> list[str]:
        """检查文件语法"""
        errors = []
        
        if target.endswith(".py"):
            try:
                import ast
                ast.parse(content)
            except SyntaxError as e:
                errors.append(f"Python SyntaxError: {e}")
        
        elif target.endswith((".js", ".jsx", ".ts", ".tsx")):
            with tempfile.NamedTemporaryFile(mode="w", suffix=target[-3:], delete=False) as f:
                f.write(content)
                tmp_path = f.name
            try:
                result = subprocess.run(
                    ["node", "--check", tmp_path],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode != 0:
                    errors.append(f"JS/TS SyntaxError: {result.stderr[:200]}")
            except Exception as e:
                errors.append(f"Syntax check failed: {e}")
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        
        elif target.endswith(".json"):
            try:
                json.loads(content)
            except json.JSONDecodeError as e:
                errors.append(f"JSON Error: {e}")
        
        return errors
    
    def _audit_log(self, baseline: FileBaseline, new_content: str, new_lines: int, new_sha256: str):
        """审计日志"""
        new_bytes = len(new_content.encode("utf-8"))
        logger.info(
            f"FILE_AUDIT target={baseline.path} "
            f"old_lines={baseline.lines} new_lines={new_lines} "
            f"old_bytes={baseline.size_bytes} new_bytes={new_bytes} "
            f"old_sha256={baseline.sha256[:16]} new_sha256={new_sha256[:16]} "
            f"ratio={new_lines/max(baseline.lines,1):.2f}"
        )
