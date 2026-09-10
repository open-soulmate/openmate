"""
Skill: self_introspect_progress_reporter
描述：定期对比'计划改进项'与'实际执行结果'，生成结构化进度报告，
      强制建立'规划-执行-反馈'的闭环，支撑'自编程'、'错误自修复'和'知识积累'目标。
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ─── 常量定义 ───────────────────────────────────────────────────────────────────

SKILL_NAME = "self_introspect_progress_reporter"

# 文件路径
PLAN_FILE = "plans/current_evolution_plan.json"
EXECUTION_LOG_FILE = "logs/execution_log.jsonl"
PROGRESS_REPORT_FILE = "reports/evolution_progress.json"
LONG_TERM_MEMORY_FILE = "memory/long_term_memory.json"

# 默认配置
DEFAULT_CYCLE_COUNT = 0
DEFAULT_REPORT_INTERVAL_HOURS = 24  # 默认报告间隔（小时）


# ─── 工具函数 ───────────────────────────────────────────────────────────────────

def _ensure_directory(file_path: str) -> None:
    """确保文件所在目录存在。"""
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def _load_json_file(file_path: str, default: Any = None) -> Any:
    """安全地加载 JSON 文件，文件不存在则返回 default。"""
    if not os.path.exists(file_path):
        return default
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[{SKILL_NAME}] Warning: Failed to load {file_path}: {e}")
        return default


def _load_jsonl_file(file_path: str) -> List[Dict[str, Any]]:
    """安全地加载 JSONL 文件（每行一个 JSON 对象），文件不存在则返回空列表。"""
    if not os.path.exists(file_path):
        return []
    records: List[Dict[str, Any]] = []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line_number, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"[{SKILL_NAME}] Warning: Skipped malformed JSON at line {line_number} in {file_path}: {e}")
    except IOError as e:
        print(f"[{SKILL_NAME}] Warning: Failed to read {file_path}: {e}")
    return records


def _save_json_file(file_path: str, data: Any) -> None:
    """安全地保存 JSON 文件。"""
    _ensure_directory(file_path)
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"[{SKILL_NAME}] Successfully saved: {file_path}")
    except IOError as e:
        print(f"[{SKILL_NAME}] Error: Failed to save {file_path}: {e}")
        raise


def _get_current_timestamp() -> str:
    """获取当前时间的 ISO8601 格式时间戳（UTC）。"""
    return datetime.now(timezone.utc).isoformat()


def _parse_timestamp(timestamp_str: str) -> Optional[float]:
    """将 ISO8601 时间戳字符串解析为 Unix 时间戳（秒）。"""
    try:
        dt = datetime.fromisoformat(timestamp_str)
        return dt.timestamp()
    except (ValueError, TypeError) as e:
        print(f"[{SKILL_NAME}] Warning: Failed to parse timestamp '{timestamp_str}': {e}")
        return None


def _is_in_time_window(record_timestamp_str: str, start_timestamp_str: Optional[str]) -> bool:
    """
    判断记录的时间戳是否在指定时间窗口内（在 start_timestamp 之后，含等于）。
    如果 start_timestamp 为 None，则所有记录都被认为在窗口内。
    """
    if start_timestamp_str is None:
        return True

    record_ts = _parse_timestamp(record_timestamp_str)
    start_ts = _parse_timestamp(start_timestamp_str)

    if record_ts is None:
        return False
    if start_ts is None:
        return True

    return record_ts >= start_ts


# ─── 核心逻辑 ───────────────────────────────────────────────────────────────────

def _load_previous_report() -> Dict[str, Any]:
    """加载上一次的进度报告，提取关键状态信息。"""
    previous_report = _load_json_file(PROGRESS_REPORT_FILE, default={})
    return {
        "last_report_timestamp": previous_report.get("report_timestamp", None),
        "cycle_count": previous_report.get("cycle_count", DEFAULT_CYCLE_COUNT),
    }


def _load_evolution_plan() -> Dict[str, Any]:
    """
    加载进化计划文件。
    预期结构：
    {
      "plan_id": str,
      "timestamp": str,
      "items": [
        {
          "id": str,
          "type": str,              # 'optimization' | 'bugfix' | 'new_feature'
          "target": str,
          "description": str,
          "expected_outcome": str,
          "status": str             # 'planned' | 'failed' | 'completed'
        },
        ...
      ]
    }
    """
    plan = _load_json_file(PLAN_FILE, default=None)
    if plan is None:
        print(f"[{SKILL_NAME}] Warning: Evolution plan not found at {PLAN_FILE}. Returning empty plan.")
        return {
            "plan_id": "unknown",
            "timestamp": _get_current_timestamp(),
            "items": [],
        }
    # 确保 items 字段存在
    if "items" not in plan:
        plan["items"] = []
    return plan


def _load_execution_logs() -> List[Dict[str, Any]]:
    """
    加载执行日志文件。
    每行预期结构：
    {
      "timestamp": str,
      "actor": str,                 # 'agent' | 'partner'
      "action_type": str,
      "target": str,
      "description": str,
      "outcome": str,               # 'success' | 'fail' | 'partial'
      "output_summary": str,
      "related_plan_item_id": str   # 关联的计划项 ID
    }
    """
    return _load_jsonl_file(EXECUTION_LOG_FILE)


def _classify_improvements(
    plan_items: List[Dict[str, Any]],
    execution_logs: List[Dict[str, Any]],
    last_report_timestamp: Optional[str],
) -> tuple:
    """
    将计划项分类为已执行和未执行。

    匹配规则：
    1. 仅匹配 actor == 'agent' 的执行记录
    2. 通过 related_plan_item_id 字段关联计划项
    3. 仅考虑在 last_report_timestamp 之后的执行记录（时间窗口）

    返回：
        (executed_improvements, pending_improvements)
    """
    # 构建 agent 发起的、在时间窗口内的执行记录索引
    # key: related_plan_item_id, value: list of matching execution records
    agent_execution_index: Dict[str, List[Dict[str, Any]]] = {}

    for log_entry in execution_logs:
        # 只考虑 agent 自身发起的执行
        actor = log_entry.get("actor", "")
        if actor != "agent":
            continue

        # 检查时间窗口
        log_timestamp = log_entry.get("timestamp", "")
        if not _is_in_time_window(log_timestamp, last_report_timestamp):
            continue

        # 按 related_plan_item_id 索引
        related_id = log_entry.get("related_plan_item_id", "")
        if not related_id:
            continue

        if related_id not in agent_execution_index:
            agent_execution_index[related_id] = []
        agent_execution_index[related_id].append(log_entry)

    # 分类计划项
    executed_improvements: List[Dict[str, Any]] = []
    pending_improvements: List[Dict[str, Any]] = []

    for item in plan_items:
        item_id = item.get("id", "")

        # 检查计划项自身的状态