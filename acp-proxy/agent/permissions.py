"""统一权限策略层 — plan/ask/auto/full四档

借鉴自：
- Warp 的四档自主（denylist-first）
- Claude Code 的permission modes
- Cline 的auto-approve配置
- Pi 的Project Trust分阶段

核心思想：
1. 不是所有工具都需要用户确认
2. 分四档：plan(只读) → ask(询问) → auto(自动) → full(全权)
3. 高风险操作永远需要确认
4. 可以按工具、按路径、按操作类型配置
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger("acp-agent.permissions")


class PermissionLevel(str, Enum):
    PLAN = "plan"    # 只读模式：不能修改任何东西
    ASK = "ask"      # 询问模式：修改前询问用户
    AUTO = "auto"    # 自动模式：安全操作自动执行
    FULL = "full"    # 全权模式：所有操作自动执行（慎用）


class RiskLevel(str, Enum):
    SAFE = "safe"        # 读取、搜索、列出
    MODERATE = "moderate"  # 创建、编辑
    HIGH = "high"        # 删除、覆盖、执行命令
    CRITICAL = "critical"  # 系统操作、网络请求、权限变更


@dataclass
class ToolPolicy:
    """工具的权限策略"""
    tool_name: str
    risk_level: RiskLevel
    min_permission: PermissionLevel  # 执行此工具所需的最低权限
    always_confirm: bool = False  # 是否总是需要确认
    allowed_paths: list[str] = field(default_factory=list)  # 允许的路径模式
    denied_paths: list[str] = field(default_factory=list)   # 禁止的路径模式


class PermissionManager:
    """权限管理器
    
    Usage:
        pm = PermissionManager()
        
        # 设置当前权限级别
        pm.set_level(PermissionLevel.AUTO)
        
        # 检查是否可以执行
        allowed, reason = pm.check("delete_file", {"path": "/tmp/test.txt"})
        
        if not allowed:
            return reason  # 返回给模型的提示
    """
    
    def __init__(self):
        self._level = PermissionLevel.ASK  # 默认询问模式
        self._tool_policies: dict[str, ToolPolicy] = {}
        self._session_overrides: dict[str, PermissionLevel] = {}
        self._setup_default_policies()
    
    def _setup_default_policies(self):
        """设置默认的工具权限策略"""
        
        # 安全操作（只读）
        safe_tools = [
            "read_file", "list_files", "search_files", "glob",
            "web_search", "web_extract", "get_current_time",
            "get_system_info", "list_skills", "view_skill",
        ]
        for tool in safe_tools:
            self._tool_policies[tool] = ToolPolicy(
                tool_name=tool,
                risk_level=RiskLevel.SAFE,
                min_permission=PermissionLevel.PLAN,
            )
        
        # 中等风险（创建/编辑）
        moderate_tools = [
            "write_file", "edit_file", "create_directory",
            "copy_file", "move_file",
        ]
        for tool in moderate_tools:
            self._tool_policies[tool] = ToolPolicy(
                tool_name=tool,
                risk_level=RiskLevel.MODERATE,
                min_permission=PermissionLevel.ASK,
            )
        
        # 高风险（删除/执行）
        high_tools = [
            "delete_file", "terminal", "execute_code",
            "run_script", "kill_process",
        ]
        for tool in high_tools:
            self._tool_policies[tool] = ToolPolicy(
                tool_name=tool,
                risk_level=RiskLevel.HIGH,
                min_permission=PermissionLevel.ASK,
                always_confirm=True,
            )
        
        # 关键操作（系统/网络）
        critical_tools = [
            "install_package", "modify_system", "network_request",
            "change_permissions", "manage_service",
        ]
        for tool in critical_tools:
            self._tool_policies[tool] = ToolPolicy(
                tool_name=tool,
                risk_level=RiskLevel.CRITICAL,
                min_permission=PermissionLevel.ASK,
                always_confirm=True,
            )
        
        # 设置路径限制
        self._tool_policies["delete_file"].denied_paths = [
            "/etc", "/usr", "/bin", "/sbin", "/boot",
            "/home/climbing/.ssh", "/home/climbing/.gnupg",
        ]
        self._tool_policies["write_file"].denied_paths = [
            "/etc", "/usr", "/bin", "/sbin", "/boot",
        ]
    
    def set_level(self, level: PermissionLevel, session_id: str | None = None):
        """设置权限级别"""
        if session_id:
            self._session_overrides[session_id] = level
        else:
            self._level = level
        logger.info(f"[permissions] Level set to {level.value} for {session_id or 'global'}")
    
    def get_level(self, session_id: str | None = None) -> PermissionLevel:
        """获取当前权限级别"""
        if session_id and session_id in self._session_overrides:
            return self._session_overrides[session_id]
        return self._level
    
    def register_tool(self, policy: ToolPolicy):
        """注册工具策略"""
        self._tool_policies[policy.tool_name] = policy
    
    def _check_path_restrictions(
        self,
        policy: ToolPolicy,
        args: dict,
    ) -> tuple[bool, str]:
        """检查路径限制"""
        path = args.get("path", "")
        if not path:
            return True, ""
        
        # 检查禁止路径
        for denied in policy.denied_paths:
            if path.startswith(denied):
                return False, f"路径 {path} 在禁止访问的目录中: {denied}"
        
        # 如果有允许路径列表，检查是否在列表中
        if policy.allowed_paths:
            for allowed in policy.allowed_paths:
                if path.startswith(allowed):
                    return True, ""
            return False, f"路径 {path} 不在允许的目录中"
        
        return True, ""
    
    def check(
        self,
        tool_name: str,
        args: dict | None = None,
        session_id: str | None = None,
    ) -> tuple[bool, str]:
        """检查是否允许执行
        
        Returns:
            (allowed, reason) — reason在allowed=False时给出原因
        """
        args = args or {}
        current_level = self.get_level(session_id)
        
        # 获取工具策略
        policy = self._tool_policies.get(tool_name)
        if not policy:
            # 未知工具，按中等风险处理
            policy = ToolPolicy(
                tool_name=tool_name,
                risk_level=RiskLevel.MODERATE,
                min_permission=PermissionLevel.ASK,
            )
        
        # PLAN模式：只允许SAFE级别的工具
        if current_level == PermissionLevel.PLAN:
            if policy.risk_level != RiskLevel.SAFE:
                return False, (
                    f"当前是Plan模式（只读），不能执行 {tool_name} "
                    f"(风险级别: {policy.risk_level.value})。"
                    f"切换到Ask或Auto模式才能执行。"
                )
            return True, ""
        
        # 检查路径限制
        path_ok, path_reason = self._check_path_restrictions(policy, args)
        if not path_ok:
            return False, path_reason
        
        # ASK模式：所有操作都需要确认
        if current_level == PermissionLevel.ASK:
            if policy.always_confirm or policy.risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
                return False, (
                    f"⚠️ 操作 {tool_name} 需要用户确认 "
                    f"(风险级别: {policy.risk_level.value})。"
                    f"请询问用户是否继续。"
                )
            return True, ""
        
        # AUTO模式：安全和中等风险自动执行，高风险需要确认
        if current_level == PermissionLevel.AUTO:
            if policy.always_confirm:
                return False, (
                    f"⚠️ 操作 {tool_name} 被标记为总是需要确认。"
                    f"请询问用户是否继续。"
                )
            if policy.risk_level == RiskLevel.CRITICAL:
                return False, (
                    f"⚠️ 操作 {tool_name} 是关键操作，"
                    f"即使在Auto模式下也需要确认。"
                )
            return True, ""
        
        # FULL模式：所有操作自动执行（除了路径限制）
        if current_level == PermissionLevel.FULL:
            return True, ""
        
        return False, f"未知的权限级别: {current_level}"
    
    def get_stats(self) -> dict:
        """权限统计"""
        return {
            "current_level": self._level.value,
            "session_overrides": {
                sid: level.value
                for sid, level in self._session_overrides.items()
            },
            "tool_policies": {
                name: {
                    "risk": policy.risk_level.value,
                    "min_permission": policy.min_permission.value,
                    "always_confirm": policy.always_confirm,
                }
                for name, policy in list(self._tool_policies.items())[:20]
            },
        }
