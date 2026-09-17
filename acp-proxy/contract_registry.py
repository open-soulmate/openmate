"""契约注册表 — 跨repo协议/API接口的显式保护

问题：evo 313个周期中反复改坏chat-client.tsx的WS协议，
因为它看不到opensoul后端的ws_chat.py期望什么格式。

方案：把跨repo契约显式注册，evo修改涉及契约文件时强制校验。

借鉴：
- LangGraph: checkpointer契约测试
- deepagents: trust门（"调用时拒绝而非隐藏"）
- agno: 环境/策略指纹分离
"""
import json
import logging
import hashlib
from pathlib import Path
from dataclasses import dataclass, field

logger = logging.getLogger("contract-registry")


@dataclass
class Contract:
    """一个跨repo契约定义"""
    name: str
    description: str
    # 涉及的文件（相对repo根路径）
    files: list[str]
    # 契约规则：[{"type": "must_contain", "file": "...", "pattern": "..."}, ...]
    rules: list[dict] = field(default_factory=list)
    # 违反时的动作：block（阻止merge）/ warn（警告但不阻止）
    severity: str = "block"


# ─── 契约定义 ────────────────────────────────────────────────────────────

CONTRACTS: list[Contract] = [
    Contract(
        name="ws-chat-protocol",
        description="前端↔后端WS消息协议：type/message/text/attachments/session_id/agent_id",
        files=[
            "src/app/(app)/chat/chat-client.tsx",
            "src/stores/chat-store.ts",
            "src/components/global-websocket.tsx",
        ],
        rules=[
            {
                "type": "must_not_contain",
                "file": "src/app/(app)/chat/chat-client.tsx",
                "pattern": "type: 'send_message'",
                "reason": "后端ws_chat.py期望type:'message'，不是'send_message'",
            },
            {
                "type": "must_not_contain",
                "file": "src/app/(app)/chat/chat-client.tsx",
                "pattern": 'type: "send_message"',
                "reason": "后端ws_chat.py期望type:'message'",
            },
            {
                "type": "must_contain_one_of",
                "file": "src/app/(app)/chat/chat-client.tsx",
                "patterns": ["session/prompt", "session/new", "type: 'message'", 'type: "message"'],
                "reason": "必须使用已知的协议格式（JSON-RPC session/prompt 或 WS message）",
            },
        ],
        severity="block",
    ),
    Contract(
        name="acp-jsonrpc-protocol",
        description="ACP JSON-RPC 2.0协议：initialize→session/new→session/prompt",
        files=[
            "src/app/(app)/chat/chat-client.tsx",
        ],
        rules=[
            {
                "type": "must_not_contain",
                "file": "src/app/(app)/chat/chat-client.tsx",
                "pattern": "send_message",
                "reason": "ACP协议用JSON-RPC method（session/prompt），不用send_message",
            },
        ],
        severity="block",
    ),
    Contract(
        name="markdown-content-export",
        description="markdown-content.tsx必须导出default和CodeBlockProps",
        files=[
            "src/components/markdown-content.tsx",
        ],
        rules=[
            {
                "type": "must_contain",
                "file": "src/components/markdown-content.tsx",
                "pattern": "export default",
                "reason": "chat-client.tsx用default import",
            },
            {
                "type": "must_contain",
                "file": "src/components/markdown-content.tsx",
                "pattern": "CodeBlockProps",
                "reason": "chat-client.tsx引用CodeBlockProps类型",
            },
        ],
        severity="block",
    ),
    Contract(
        name="app-store-api",
        description="app-store必须导出global-websocket.tsx依赖的方法",
        files=[
            "src/stores/app-store.ts",
            "src/components/global-websocket.tsx",
        ],
        rules=[
            {
                "type": "must_contain",
                "file": "src/stores/app-store.ts",
                "pattern": "setGlobalWsConnected",
                "reason": "global-websocket.tsx依赖setGlobalWsConnected方法",
            },
            {
                "type": "must_contain",
                "file": "src/stores/app-store.ts",
                "pattern": "incrementUnread",
                "reason": "global-websocket.tsx依赖incrementUnread方法",
            },
            {
                "type": "must_contain",
                "file": "src/stores/app-store.ts",
                "pattern": "activeSessionId",
                "reason": "global-websocket.tsx依赖activeSessionId状态",
            },
        ],
        severity="block",
    ),
]


def check_contracts(repo_root: Path, changed_files: list[str]) -> dict:
    """检查所有涉及changed_files的契约
    
    Returns:
        {
            "passed": bool,
            "violations": [{"contract": str, "file": str, "reason": str, "severity": str}],
            "checked": int,
        }
    """
    changed_set = set(changed_files)
    violations = []
    checked = 0
    
    for contract in CONTRACTS:
        # 只检查涉及变更文件的契约
        contract_files = set(contract.files)
        if not contract_files & changed_set:
            continue
        
        checked += 1
        
        for rule in contract.rules:
            rule_file = rule.get("file", "")
            full_path = repo_root / rule_file
            
            if not full_path.exists():
                # 文件不存在—如果这个文件在changed_files中，说明被删除了
                if rule_file in changed_set:
                    violations.append({
                        "contract": contract.name,
                        "file": rule_file,
                        "reason": f"契约文件被删除: {rule_file}",
                        "severity": contract.severity,
                    })
                continue
            
            content = full_path.read_text(encoding="utf-8", errors="replace")
            
            if rule["type"] == "must_contain":
                if rule["pattern"] not in content:
                    violations.append({
                        "contract": contract.name,
                        "file": rule_file,
                        "reason": f"缺少必需内容 '{rule['pattern']}': {rule['reason']}",
                        "severity": contract.severity,
                    })
            
            elif rule["type"] == "must_not_contain":
                if rule["pattern"] in content:
                    violations.append({
                        "contract": contract.name,
                        "file": rule_file,
                        "reason": f"包含禁止内容 '{rule['pattern']}': {rule['reason']}",
                        "severity": contract.severity,
                    })
            
            elif rule["type"] == "must_contain_one_of":
                patterns = rule.get("patterns", [])
                if not any(p in content for p in patterns):
                    violations.append({
                        "contract": contract.name,
                        "file": rule_file,
                        "reason": f"不包含任何合法模式 {patterns}: {rule['reason']}",
                        "severity": contract.severity,
                    })
    
    # block级别的violation导致passed=False
    has_block = any(v["severity"] == "block" for v in violations)
    
    result = {
        "passed": not has_block,
        "violations": violations,
        "checked": checked,
    }
    
    if violations:
        logger.warning(f"Contract check: {len(violations)} violations in {checked} contracts")
        for v in violations:
            logger.warning(f"  [{v['severity']}] {v['contract']}: {v['reason']}")
    
    return result


def get_protected_files() -> set[str]:
    """获取所有受契约保护的文件列表
    
    evo规划时应避免修改这些文件，或修改后必须通过契约检查。
    """
    protected = set()
    for contract in CONTRACTS:
        protected.update(contract.files)
    return protected
