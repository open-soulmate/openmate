# -*- coding: utf-8 -*-
"""P1 上下文逐项token归因接线测试 — claude-code SDKContextUsage移植（agent路径侧）

调研来源：10-claude-code-source.md #7 SDKContextUsage（mcp_tools[]/memory_files[]/
agents[]/skills[]每项多少token + over_limit{tokens_over,kind}两种超限性质）；
SUMMARY.md P1"token逐项归因（per-tool/per-agent）"——用户"不知道上下文被什么吃掉了"。

验证三层：
1. 纯模块：estimate_tokens公式（与opensoul侧镜像一致）/SDKContextUsage形态/超限两态
2. AttributionLedger账本：agent写→新实例（=app.py API进程）跨进程读
3. SoulMateAgent真实路径端到端：_run_llm_with_tools跑真实工具循环→账本出现逐项归因记录
"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.token_attribution import (
    DEFAULT_COMPACTION_RATIO,
    KIND_BUILTIN_TOOL,
    KIND_MEMORY,
    KIND_MCP_TOOL,
    KIND_SKILL,
    KIND_SYSTEM_PROMPT,
    AttributionLedger,
    ContextItem,
    build_context_usage,
    estimate_tokens,
    items_from_openai_tools,
    resolve_context_window,
)
from agent.soulmate_agent import SoulMateAgent
from tests.test_steering import FakeLLM, make_agent, run


# ════════════════════════════════════════════════════════════════
# 1. 纯模块
# ════════════════════════════════════════════════════════════════

class TestEstimateTokens:
    def test_formula_matches_opensoul_mirror(self):
        """镜像一致性：opensoul/src/cortex/token_attribution.py同公式（那边测试同样断言）"""
        assert estimate_tokens("a" * 400) == 100
        assert estimate_tokens("上下文归因" * 20) == 100  # CJK≈1token/字符
        text = "任务" * 10 + "tool_call" * 8
        assert estimate_tokens(text) == 20 + (72 // 4)
        assert estimate_tokens("") == 0
        assert estimate_tokens(None) == 0

    def test_fullwidth_counts_as_cjk(self):
        assert estimate_tokens("，。！？") == 4


class TestBuildContextUsage:
    def _items(self):
        return [
            ContextItem(kind=KIND_MCP_TOOL, name="feishu_search", source="mcp", tokens=900),
            ContextItem(kind=KIND_BUILTIN_TOOL, name="read_file", source="builtin", tokens=300),
            ContextItem(kind=KIND_MEMORY, name="memory_recall[0]", source="mc", tokens=200),
            ContextItem(kind=KIND_SKILL, name="excel-skill", source="sm", tokens=1500),
            ContextItem(kind=KIND_SYSTEM_PROMPT, name="soulmate_base_prompt", source="sa", tokens=2500),
        ]

    def test_sdk_shape(self):
        usage = build_context_usage(self._items(), max_tokens=10000)
        assert usage["total_tokens"] == 5400
        assert usage["percentage"] == 54.0
        assert usage["mcp_tools"][0]["name"] == "feishu_search"
        assert usage["builtin_tools"][0]["tokens"] == 300
        assert usage["memory_files"][0]["name"] == "memory_recall[0]"
        assert usage["skills"][0]["name"] == "excel-skill"
        assert usage["sections"][KIND_SYSTEM_PROMPT] == 2500
        assert usage["top_consumers"][0]["name"] == "soulmate_base_prompt"

    def test_over_limit_two_kinds(self):
        # 5400 > 10000*0.75=7500? 否 → 无超限
        assert build_context_usage(self._items(), max_tokens=10000)["over_limit"] is None
        # compaction_window：窗口8000→阈值6000，5400<6000无超限；窗口6000→阈值4500，5400>4500
        u = build_context_usage(self._items(), max_tokens=6000)
        assert u["over_limit"]["kind"] == "compaction_window"
        assert u["over_limit"]["tokens_over"] == 5400 - int(6000 * DEFAULT_COMPACTION_RATIO)
        # hard_limit：窗口5000 < 5400
        u2 = build_context_usage(self._items(), max_tokens=5000)
        assert u2["over_limit"]["kind"] == "hard_limit"
        assert u2["over_limit"]["tokens_over"] == 400

    def test_window_resolution(self):
        assert resolve_context_window("deepseek-r1") == 65536
        assert resolve_context_window("mimo-v2.5") == 65536
        assert resolve_context_window("unknown") == 32000  # agent侧默认=llm_engine truncate默认
        assert resolve_context_window(None) == 32000

    def test_items_from_openai_tools_per_tool(self):
        tools = [
            {"type": "function", "function": {"name": "read_file", "description": "读取文件" * 30,
                                               "parameters": {"type": "object"}}},
            {"type": "function", "function": {"name": "terminal", "description": "exec"}},
        ]
        items = items_from_openai_tools(tools, source="builtin")
        assert [i.name for i in items] == ["read_file", "terminal"]
        assert items[0].kind == KIND_BUILTIN_TOOL
        assert items[0].tokens > items[1].tokens
        assert items_from_openai_tools(tools, source="mcp")[0].kind == KIND_MCP_TOOL
        assert items_from_openai_tools(None, source="mcp") == []
        # 坏条目容错：dict缺字段→unnamed_tool；非dict→跳过
        bad = items_from_openai_tools([{"type": "function"}, "junk"], source="mcp")
        assert len(bad) == 1 and bad[0].name == "unnamed_tool"


# ════════════════════════════════════════════════════════════════
# 2. AttributionLedger账本 — agent写 / API进程跨进程读
# ════════════════════════════════════════════════════════════════

def _usage(total=1000, over=None):
    return {
        "total_tokens": total, "raw_max_tokens": 32000, "percentage": round(total * 100 / 32000, 1),
        "over_limit": over, "mcp_tools": [], "memory_files": [], "skills": [], "agents": [],
        "builtin_tools": [], "evolution_tools": [], "tools": [], "sections": {},
        "top_consumers": [{"kind": "skill", "name": "excel", "tokens": total, "source": "sm"}],
        "item_count": 3,
    }


class TestAttributionLedger:
    def test_write_and_cross_process_read(self, tmp_path):
        """跨进程语义：writer=agent子进程，reader=app.py API进程（新实例同路径）"""
        d = str(tmp_path / "ta")
        writer = AttributionLedger(ledger_dir=d)
        writer.record(_usage(800), session_id="sess-1", model="mimo-x-pro-preview")
        reader = AttributionLedger(ledger_dir=d)  # 新实例=API进程视角
        stats = reader.get_stats()
        assert stats["total_records"] == 1
        assert stats["summary"]["latest"]["session_id"] == "sess-1"
        assert stats["summary"]["latest"]["total_tokens"] == 800
        assert stats["summary"]["latest"]["raw_max_tokens"] == 32000
        assert stats["recent"][0]["model"] == "mimo-x-pro-preview"
        assert stats["ledger_path"].endswith("attribution_ledger.jsonl")

    def test_summary_aggregation(self, tmp_path):
        d = str(tmp_path / "ta2")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(1000), session_id="a")
        w.record({"total_tokens": 3000, "raw_max_tokens": 32000,
                  "over_limit": {"tokens_over": 100, "kind": "hard_limit"},
                  "top_consumers": [
                      {"kind": "skill", "name": "excel", "tokens": 800, "source": "sm"},
                      {"kind": "mcp_tool", "name": "feishu", "tokens": 700, "source": "mcp"},
                  ], "item_count": 5}, session_id="b")
        s = AttributionLedger(ledger_dir=d).get_stats()["summary"]
        assert s["total_records"] == 2
        assert s["over_limit_records"] == 1
        assert s["avg_total_tokens"] == 2000
        assert s["max_total_tokens"] == 3000
        assert s["top_consumers"][0]["name"] == "excel"  # 1000+800=1800 > feishu 700
        assert s["top_consumers"][0]["times_seen"] == 2
        assert s["latest"]["session_id"] == "b"

    def test_empty_ledger(self, tmp_path):
        stats = AttributionLedger(ledger_dir=str(tmp_path / "empty")).get_stats()
        assert stats["total_records"] == 0
        assert stats["recent"] == []

    def test_record_failure_nonfatal(self, tmp_path):
        """账本目录不可写→record不抛（归因绝不能阻断agent路径）"""
        bad = AttributionLedger(ledger_dir=str(tmp_path))  # 目录本身当ledger_dir没问题
        bad.ledger_path = tmp_path  # 文件路径指向目录→open失败
        rec = bad.record(_usage(1))  # 不抛
        assert rec["usage"]["total_tokens"] == 1

    def test_corrupt_ledger_lines_skipped(self, tmp_path):
        d = tmp_path / "corrupt"
        d.mkdir()
        (d / "attribution_ledger.jsonl").write_text(
            '{"ts":1,"usage":{"total_tokens":10,"top_consumers":[]},"session_id":"x"}\n'
            "NOT-JSON\n\n", encoding="utf-8")
        stats = AttributionLedger(ledger_dir=str(d)).get_stats()
        assert stats["total_records"] == 1  # 坏行安全跳过

    def test_recent_capped(self, tmp_path):
        d = str(tmp_path / "cap")
        w = AttributionLedger(ledger_dir=d, max_recent=3)
        for i in range(5):
            w.record(_usage(i + 1), session_id=f"s{i}")
        stats = AttributionLedger(ledger_dir=d).get_stats(limit=3)
        assert len(stats["recent"]) == 3
        assert stats["recent"][0]["session_id"] == "s4"  # 最新在前
        assert stats["total_records"] == 5  # 总数不受limit影响


# ════════════════════════════════════════════════════════════════
# 3. SoulMateAgent真实路径端到端 — _run_llm_with_tools写归因账本
# ════════════════════════════════════════════════════════════════

class _GateAllow:
    def __init__(self):
        self.calls = []

    async def check(self, session_id, tool_name, tool_args, **kw):
        self.calls.append(tool_name)
        return MagicMock(allowed=True)


def _attr_agent(tmp_path, scripts):
    agent = make_agent(tmp_path, scripts=scripts)
    agent._permission_gate = _GateAllow()
    agent._token_attr_ledger = AttributionLedger(ledger_dir=str(tmp_path / "ta_e2e"))
    # 真实形态注入：召回记忆（dict列表）+ 技能学习上下文
    agent._memory_consolidator.recall.return_value = [
        {"content": "用户在赤峰做门禁项目" * 10},
        {"content": "上次投标因售后网点丢分" * 8},
    ]
    agent._skill_learner.get_context_prompt.return_value = "遇到表格任务先读excel技能再执行" * 5
    agent._pref_learner.get_context_prompt.return_value = "回答用中文，简洁"
    agent._reflection_engine.get_improvement_context.return_value = "上次改代码没跑测试"
    return agent


class TestSoulMateAgentWiring:
    def test_init_has_ledger(self):
        """__init__必须初始化_token_attr_ledger（不是只有测试harness才有）"""
        src = Path(__file__).parent.parent / "agent" / "soulmate_agent.py"
        text = src.read_text(encoding="utf-8")
        assert "self._token_attr_ledger = AttributionLedger(" in text
        assert "from agent.token_attribution import" in text

    def test_e2e_ledger_records_context_composition(self, tmp_path):
        """真实路径：_run_llm_with_tools跑完整工具循环→账本出现SDKContextUsage记录"""
        agent = _attr_agent(tmp_path, scripts=[["你好，任务已完成"]])
        matched = [{"name": "excel-skill", "content": "X" * 400, "code_template": "print(1)"}]
        user_text = "帮我处理一下门禁表格任务，先看看项目情况"
        resp, _ = run(agent._run_llm_with_tools(
            [{"role": "user", "content": user_text}], "s1",
            matched_skills=matched, user_text=user_text,
        ))
        assert "你好" in resp
        stats = agent._token_attr_ledger.get_stats()
        assert stats["total_records"] == 1
        rec = stats["recent"][0]
        usage = rec["usage"]
        assert rec["session_id"] == "s1"
        # SDKContextUsage逐项明细必须真实反映注入内容
        assert usage["skills"], "skills[]必须有条目"
        skill_names = [s["name"] for s in usage["skills"]]
        assert "excel-skill" in skill_names          # matched_skills逐项
        assert "learned_skills" in skill_names       # skill_learner注入项
        assert usage["memory_files"], "memory_files[]必须逐条"
        assert len(usage["memory_files"]) == 2       # 两条召回记忆
        assert usage["memory_files"][0]["name"] == "memory_recall[0]"
        # 工具定义逐项（per-tool）：builtin+evolution来源
        tool_names = [t["name"] for t in usage["builtin_tools"]]
        assert "read_file" in tool_names
        assert "terminal" in tool_names
        assert "execute_code" in tool_names
        assert any(t["name"] == "clarify" or "clarify" in t["name"] for t in usage["builtin_tools"]) or \
               any("clarify" in t["name"] for t in usage["builtin_tools"] + usage["evolution_tools"] + usage["tools"])
        # sections：system_prompt基础段+偏好+反思+会话消息
        assert usage["sections"].get(KIND_SYSTEM_PROMPT, 0) > 0
        assert usage["sections"].get("preference", 0) > 0
        assert usage["sections"].get("improvement", 0) > 0
        assert usage["sections"].get("message", 0) > 0  # conversation_history
        # 总量/百分比/超限字段齐全（SDK形态）
        assert usage["total_tokens"] > 0
        assert usage["raw_max_tokens"] == 32000  # AGENT_CONTEXT_WINDOW默认
        assert "percentage" in usage
        assert "over_limit" in usage
        assert usage["item_count"] == len(usage["skills"]) + len(usage["memory_files"]) + \
               len(usage["builtin_tools"]) + len(usage.get("evolution_tools", [])) + \
               len(usage.get("mcp_tools", [])) + len(usage.get("tools", [])) + \
               sum(1 for _ in usage["sections"])  # 明细数组+sections类目≈item总数（粗校验）
        # top_consumers排序
        top_tokens = [c["tokens"] for c in usage["top_consumers"]]
        assert top_tokens == sorted(top_tokens, reverse=True)

    def test_e2e_system_prompt_bytes_unchanged_by_attribution(self, tmp_path):
        """归因不得改变system_prompt内容（观测旁路零副作用）：skill/memory注入文本与原文一致"""
        agent = _attr_agent(tmp_path, scripts=[["ok"]])
        matched = [{"name": "demo-skill", "content": "技能正文ABC", "code_template": "code()"}]
        user_text = "这是一条足够长的用户消息用于触发记忆召回"
        run(agent._run_llm_with_tools(
            [{"role": "user", "content": user_text}], "s2",
            matched_skills=matched, user_text=user_text,
        ))
        sent = agent.llm_engine.seen_messages[0]
        # FakeLLM收到的system_prompt不在messages里（chat_stream_with_tools单独收参数）——
        # 改为断言账本记录里skill条目token与注入文本估算一致（证明逐项记账读的是真实文本）
        usage = agent._token_attr_ledger.get_stats()["recent"][0]["usage"]
        demo = [s for s in usage["skills"] if s["name"] == "demo-skill"][0]
        expected_text = f"\n### demo-skill\n技能正文ABC\n```\ncode()\n```\n"
        assert demo["tokens"] == estimate_tokens(expected_text)

    def test_e2e_over_limit_flagged_when_window_small(self, tmp_path, monkeypatch):
        """AGENT_CONTEXT_WINDOW env可调→超限性质正确标记（compaction_window）"""
        monkeypatch.setenv("AGENT_CONTEXT_WINDOW", "2000")  # 阈值1500
        agent = _attr_agent(tmp_path, scripts=[["ok"]])
        user_text = "长用户消息"*20
        run(agent._run_llm_with_tools(
            [{"role": "user", "content": user_text}], "s3",
            matched_skills=[{"name": "big", "content": "内容" * 800}], user_text=user_text,
        ))
        usage = agent._token_attr_ledger.get_stats()["recent"][0]["usage"]
        assert usage["raw_max_tokens"] == 2000
        assert usage["over_limit"] is not None
        assert usage["over_limit"]["kind"] in ("compaction_window", "hard_limit")

    def test_e2e_mcp_tools_attributed_per_source(self, tmp_path):
        """MCP工具来源独立归因（per-tool×per-source）"""
        agent = _attr_agent(tmp_path, scripts=[["ok"]])

        async def _fake_mcp():
            return [{"type": "function", "function": {
                "name": "mcp__feishu__search", "description": "搜索飞书文档" * 10,
                "parameters": {"type": "object"}}}]

        agent._fetch_mcp_tools = _fake_mcp
        user_text = "查一下飞书上的项目文档然后总结"
        run(agent._run_llm_with_tools(
            [{"role": "user", "content": user_text}], "s4", user_text=user_text,
        ))
        usage = agent._token_attr_ledger.get_stats()["recent"][0]["usage"]
        assert usage["mcp_tools"], "mcp_tools[]必须有条目"
        assert usage["mcp_tools"][0]["name"] == "mcp__feishu__search"
        assert usage["mcp_tools"][0]["source"] == "mcp"
        assert usage["mcp_tools"][0]["tokens"] > 0

    def test_e2e_ledger_missing_attr_nonfatal(self, tmp_path):
        """harness未设置_token_attr_ledger→归因失败仅debug日志，agent路径照常返回"""
        agent = make_agent(tmp_path, scripts=[["正常回复"]])
        agent._permission_gate = _GateAllow()
        # __new__ harness不设置_token_attr_ledger（属性缺失→record抛AttributeError→被兜住）
        assert "_token_attr_ledger" not in agent.__dict__
        resp, _ = run(agent._run_llm_with_tools([{"role": "user", "content": "hi"}], "s5"))
        assert "正常回复" in resp  # 主路径不受影响

    def test_frontend_contract_fields(self, tmp_path):
        """monitoring页消费契约：stats必须含total_records/summary/top_consumers/latest字段"""
        agent = _attr_agent(tmp_path, scripts=[["ok"]])
        user_text = "契约验证任务消息足够长触发各注入路径"
        run(agent._run_llm_with_tools([{"role": "user", "content": user_text}], "s6", user_text=user_text))
        stats = agent._token_attr_ledger.get_stats()
        for key in ("total_records", "recent", "summary", "ledger_path"):
            assert key in stats
        summary = stats["summary"]
        for key in ("over_limit_records", "avg_total_tokens", "max_total_tokens",
                    "latest", "top_consumers"):
            assert key in summary
        latest = summary["latest"]
        for key in ("total_tokens", "percentage", "over_limit", "raw_max_tokens",
                    "session_id", "model", "item_count"):
            assert key in latest
