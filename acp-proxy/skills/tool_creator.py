import os
import json
import ast
import inspect
import importlib.util
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

class BaseSkill:
    """基础技能类"""
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.created_at = datetime.now()
    
    def execute(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement execute method")

class ToolCreatorSkill(BaseSkill):
    """MCP工具自动创造技能"""
    
    def __init__(self):
        super().__init__(
            name="tool_creator",
            description="创建MCP工具自动创造技能，支持agent识别能力缺口并自动创建新的MCP工具"
        )
        self.tool_registry: Dict[str, Dict] = {}  # 工具注册表
        self.created_tools: List[str] = []  # 已创建工具列表
        self.mcp_protocol_version = "1.0"
        self.plugins_dir = "plugins"
        self._ensure_plugins_dir()
        self._load_existing_tools()
        
    def _ensure_plugins_dir(self):
        """确保插件目录存在"""
        os.makedirs(self.plugins_dir, exist_ok=True)
    
    def _load_existing_tools(self):
        """加载现有的工具注册表"""
        registry_file = os.path.join(self.plugins_dir, "tool_registry.json")
        if os.path.exists(registry_file):
            try:
                with open(registry_file, 'r', encoding='utf-8') as f:
                    registry_data = json.load(f)
                    self.tool_registry = registry_data.get("tools", {})
                    self.created_tools = list(self.tool_registry.keys())
            except Exception as e:
                print(f"加载工具注册表失败: {e}")
    
    def _save_registry(self):
        """保存工具注册表"""
        registry_file = os.path.join(self.plugins_dir, "tool_registry.json")
        registry_data = {
            "version": self.mcp_protocol_version,
            "last_updated": datetime.now().isoformat(),
            "tools": self.tool_registry
        }
        
        try:
            with open(registry_file, 'w', encoding='utf-8') as f:
                json.dump(registry_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存工具注册表失败: {e}")
    
    def execute(self, *args, **kwargs):
        """执行工具创建流程"""
        if "failed_tasks" in kwargs:
            gaps = self.identify_capability_gaps(kwargs["failed_tasks"])
            if gaps:
                results = []
                for gap in gaps[:3]:  # 每次最多处理3个能力缺口
                    tool_spec = self.design_tool_specification(gap)
                    tool_code = self.generate_mcp_tool(tool_spec)
                    tool_name = self.register_tool(tool_code, tool_spec)
                    if tool_name:
                        results.append(tool_name)
                return {
                    "status": "success",
                    "created_tools": results,
                    "gaps_identified": len(gaps),
                    "message": f"成功创建 {len(results)} 个工具"
                }
            else:
                return {
                    "status": "success",
                    "created_tools": [],
                    "gaps_identified": 0,
                    "message": "未发现需要创建新工具的能力缺口"
                }
        else:
            return {
                "status": "error",
                "message": "缺少 failed_tasks 参数"
            }
    
    def identify_capability_gaps(self, failed_tasks: List[Dict]) -> List[Dict]:
        """
        分析历史失败任务，识别当前缺失的能力类型
        
        Args:
            failed_tasks: 失败任务列表，每个任务包含任务描述、失败原因等信息
            
        Returns:
            识别出的能力缺口列表
        """
        gaps = []
        
        # 分析失败任务模式
        capability_patterns = {
            "data_processing": ["数据处理", "解析", "转换", "清洗", "分析"],
            "api_integration": ["API", "接口", "调用", "网络请求", "服务集成"],
            "file_manipulation": ["文件操作", "读写", "解析", "转换", "格式化"],
            "math_calculation": ["计算", "数学", "统计", "算法", "数值"],
            "text_processing": ["文本处理", "字符串", "格式化", "解析", "转换"],
            "media_handling": ["图片", "音视频", "媒体", "处理", "转换"],
            "database_ops": ["数据库", "查询", "存储", "管理", "优化"],
            "system_admin": ["系统", "管理", "监控", "配置", "维护"]
        }
        
        for task in failed_tasks:
            task_desc = task.get("description", "").lower()
            failure_reason = task.get("failure_reason", "").lower()
            combined_text = f"{task_desc} {failure_reason}"
            
            # 检查是否缺少现有工具
            for capability, keywords in capability_patterns.items():
                if any(keyword in combined_text for keyword in keywords):
                    # 检查现有工具是否能处理该能力
                    if not self._has_capability(capability):
                        gap = {
                            "capability_type": capability,
                            "description": f"处理{task_desc}的能力",
                            "keywords": [kw for kw in keywords if kw in combined_text],
                            "example_task": task,
                            "priority": self._calculate_priority(task)
                        }
                        gaps.append(gap)
        
        # 去重并按优先级排序
        unique_gaps = []
        seen_types = set()
        
        for gap in gaps:
            if gap["capability_type"] not in seen_types:
                unique_gaps.append(gap)
                seen_types.add(gap["capability_type"])
        
        return sorted(unique_gaps, key=lambda x: x["priority"], reverse=True)
    
    def _has_capability(self, capability_type: str) -> bool:
        """检查是否已有特定能力的工具"""
        for tool_name, tool_info in self.tool_registry.items():
            if capability_type in tool_info.get("capabilities", []):
                return True
        return False
    
    def _calculate_priority(self, task: Dict) -> int:
        """计算任务优先级（1-10，10最高）"""