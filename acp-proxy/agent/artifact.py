"""
Artifact + Diff引擎模块 — 生成、预览、应用文件变更。
Agent通过此模块实现"Vibe Coding"：读取文件→生成修改→预览diff→应用变更→回滚。
"""

import difflib
import hashlib
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-agent.artifact")


@dataclass
class FileChange:
    """单个文件的变更记录，包含修改前后内容、diff、变更类型和校验和"""
    path: str              # 文件绝对路径
    original: str          # 修改前内容
    modified: str          # 修改后内容
    diff: str              # unified diff文本
    change_type: str       # "modify" | "create" | "delete"
    checksum_before: str   # 修改前MD5
    checksum_after: str    # 修改后MD5


@dataclass
class ArtifactBundle:
    """一组文件变更的打包，用于批量操作和ACP格式转换"""
    changes: list[FileChange] = field(default_factory=list)
    description: str = ""  # 变更描述

    def to_acp_format(self) -> list[dict]:
        """转换为ACP artifact消息格式，前端可直接渲染diff视图"""
        artifacts = []
        for change in self.changes:
            # 预览：取diff的前50行
            preview_lines = change.diff.split("\n")[:50]
            preview = "\n".join(preview_lines)
            if len(change.diff.split("\n")) > 50:
                preview += "\n... (truncated)"

            artifacts.append({
                "type": "file_change",
                "path": change.path,
                "diff": change.diff,
                "changeType": change.change_type,
                "preview": preview,
                "checksumBefore": change.checksum_before,
                "checksumAfter": change.checksum_after,
            })
        return artifacts


class ArtifactEngine:
    """Artifact + Diff引擎 — 生成、预览、应用文件变更。核心组件用于Agent的代码编辑能力"""

    def __init__(self, workspace: str):
        """初始化，绑定工作目录。所有文件操作限制在此目录内"""
        self.workspace = os.path.abspath(workspace)
        self._snapshots: dict[str, str] = {}  # path → original content for rollback

    def read_file(self, path: str) -> str:
        """读取文件原始内容，同时保存快照用于回滚"""
        abs_path = self._resolve_and_validate(path)

        with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        # 保存快照（仅首次读取时保存，保留原始版本用于回滚）
        if abs_path not in self._snapshots:
            self._snapshots[abs_path] = content

        return content

    def generate_diff(self, path: str, new_content: str) -> FileChange:
        """生成单个文件的unified diff。先读原文件，再用difflib比较差异"""
        abs_path = self._resolve_and_validate(path)

        # 读取原文件内容（同时保存快照）
        original = self.read_file(abs_path)

        # 计算校验和
        checksum_before = hashlib.md5(original.encode()).hexdigest()
        checksum_after = hashlib.md5(new_content.encode()).hexdigest()

        # 生成unified diff
        diff_lines = difflib.unified_diff(
            original.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{os.path.relpath(abs_path, self.workspace)}",
            tofile=f"b/{os.path.relpath(abs_path, self.workspace)}",
        )
        diff_text = "".join(diff_lines)

        return FileChange(
            path=abs_path,
            original=original,
            modified=new_content,
            diff=diff_text,
            change_type="modify",
            checksum_before=checksum_before,
            checksum_after=checksum_after,
        )

    def generate_create(self, path: str, content: str) -> FileChange:
        """生成新文件的artifact记录"""
        abs_path = self._resolve_and_validate(path)

        if os.path.exists(abs_path):
            raise FileExistsError(f"文件已存在，无法创建: {abs_path}")

        checksum_after = hashlib.md5(content.encode()).hexdigest()

        # 新文件的diff格式
        rel_path = os.path.relpath(abs_path, self.workspace)
        diff_lines = [f"--- /dev/null\n", f"+++ b/{rel_path}\n"]
        for i, line in enumerate(content.splitlines(keepends=True), 1):
            diff_lines.append(f"+{line}")
        diff_text = "".join(diff_lines)

        return FileChange(
            path=abs_path,
            original="",
            modified=content,
            diff=diff_text,
            change_type="create",
            checksum_before="",
            checksum_after=checksum_after,
        )

    def generate_delete(self, path: str) -> FileChange:
        """生成删除文件的artifact记录"""
        abs_path = self._resolve_and_validate(path)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"文件不存在: {abs_path}")

        original = self.read_file(abs_path)
        checksum_before = hashlib.md5(original.encode()).hexdigest()

        rel_path = os.path.relpath(abs_path, self.workspace)
        diff_lines = [f"--- a/{rel_path}\n", f"+++ /dev/null\n"]
        for line in original.splitlines(keepends=True):
            diff_lines.append(f"-{line}")
        diff_text = "".join(diff_lines)

        return FileChange(
            path=abs_path,
            original=original,
            modified="",
            diff=diff_text,
            change_type="delete",
            checksum_before=checksum_before,
            checksum_after="",
        )

    def apply_change(self, change: FileChange) -> bool:
        """应用单个变更到磁盘。返回是否成功。自动创建父目录"""
        try:
            from utils.file_safety import atomic_write
            
            if change.change_type == "delete":
                if os.path.exists(change.path):
                    os.remove(change.path)
                    logger.info("已删除文件: %s", change.path)
            elif change.change_type == "create":
                ok, err = atomic_write(change.path, change.modified)
                if not ok:
                    logger.error("创建文件失败: %s — %s", change.path, err)
                    return False
                logger.info("已创建文件: %s", change.path)
            elif change.change_type == "modify":
                # 校验：确保文件未被外部修改
                if os.path.exists(change.path):
                    current = open(change.path, "r", encoding="utf-8", errors="replace").read()
                    current_hash = hashlib.md5(current.encode()).hexdigest()
                    if current_hash != change.checksum_before:
                        logger.error("文件已被外部修改，拒绝应用: %s", change.path)
                        return False

                ok, err = atomic_write(change.path, change.modified)
                if not ok:
                    logger.error("修改文件失败: %s — %s", change.path, err)
                    return False
                logger.info("已修改文件: %s", change.path)
            return True
        except Exception as e:
            logger.error("应用变更失败 (%s): %s", change.path, e)
            return False

    def apply_bundle(self, bundle: ArtifactBundle) -> list[bool]:
        """批量应用一组变更，返回每个变更的执行结果"""
        results = []
        for change in bundle.changes:
            results.append(self.apply_change(change))
        return results

    def rollback(self, path: str) -> bool:
        """回滚单个文件到快照版本"""
        abs_path = os.path.abspath(path)
        if abs_path not in self._snapshots:
            logger.warning("无快照可回滚: %s", abs_path)
            return False

        try:
            from utils.file_safety import atomic_write
            
            original = self._snapshots[abs_path]
            if original == "":
                # 快照为空说明是新创建的文件，回滚即删除
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            else:
                ok, err = atomic_write(abs_path, original)
                if not ok:
                    logger.error("回滚写入失败: %s — %s", abs_path, err)
                    return False
            logger.info("已回滚文件: %s", abs_path)
            return True
        except Exception as e:
            logger.error("回滚失败 (%s): %s", abs_path, e)
            return False

    def rollback_all(self) -> list[str]:
        """回滚所有已修改文件，返回成功回滚的文件列表"""
        rolled_back = []
        for path in list(self._snapshots.keys()):
            if self.rollback(path):
                rolled_back.append(path)
        self._snapshots.clear()
        return rolled_back

    def _resolve_and_validate(self, path: str) -> str:
        """解析路径并验证安全性：必须在workspace内，不允许符号链接逃逸"""
        abs_path = os.path.abspath(path)

        # 如果文件存在，解析符号链接检查实际位置
        if os.path.exists(abs_path) or os.path.islink(abs_path):
            real_path = os.path.realpath(abs_path)
            if not real_path.startswith(self.workspace + os.sep) and real_path != self.workspace:
                raise PermissionError(f"路径逃逸workspace: {path} -> {real_path}")

        # 即使文件不存在，也检查声明的路径是否在workspace内
        if not abs_path.startswith(self.workspace + os.sep) and abs_path != self.workspace:
            raise PermissionError(f"路径不在workspace内: {abs_path}")

        return abs_path
