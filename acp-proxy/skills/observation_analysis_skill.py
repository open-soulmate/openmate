from acp_proxy.skills.base import BaseSkill
import json
from typing import Dict, List, Any, Optional
from datetime import datetime

class ObservationAnalysisSkill(BaseSkill):
    """
    观察分析技能 - 自动分析系统观察记录，生成见解和记忆
    打破观察积压和周期停滞僵局，为自编程和工具创造提供基础分析
    """
    
    name = "observation_analysis"
    description = "分析未处理的观察记录，识别模式，生成可执行见解"
    version = "1.0.0"
    
    def __init__(self, context: Dict[str, Any] = None):
        super().__init__(context)
        self.llm = self.context.get("llm", None)
        self.memory_store = self.context.get("memory_store", None)
        self.observation_queue = self.context.get("observation_queue", None)
        self.cycle_state = self.context.get("cycle_state", {})
        
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """执行观察分析任务"""
        try:
            # 获取未分析的观察记录
            observations = await self._get_unanalyzed_observations()
            if not observations:
                return {
                    "status": "skipped",
                    "message": "没有未分析的观察记录",
                    "analyzed_count": 0
                }
            
            analyzed_insights = []
            valuable_memories = []
            
            # 分析每条观察记录
            for observation in observations:
                insight = await self._analyze_observation(observation)
                if insight:
                    analyzed_insights.append(insight)
                    
                    # 如果见解有价值，保存为长期记忆
                    if insight.get("relevance_to_goals", 0) >= 7:
                        memory = await self._save_as_memory(insight)
                        valuable_memories.append(memory)
            
            # 清理已处理的观察记录
            await self._cleanup_processed_observations(len(observations))
            
            return {
                "status": "success",
                "analyzed_count": len(observations),
                "insights_generated": len(analyzed_insights),
                "memories_created": len(valuable_memories),
                "key_insights": self._extract_key_insights(analyzed_insights),
                "suggested_actions": self._generate_action_plan(analyzed_insights)
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"观察分析失败: {str(e)}",
                "error": str(e)
            }
    
    async def _get_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """获取未分析的观察记录"""
        try:
            if self.observation_queue:
                return await self.observation_queue.get_unprocessed()
            
            # 备用方案：从上下文获取
            observations = self.context.get("observations_unanalyzed", [])
            return observations if isinstance(observations, list) else []
            
        except Exception as e:
            print(f"获取观察记录失败: {e}")
            return []
    
    async def _analyze_observation(self, observation: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """分析单条观察记录"""
        if not self.llm:
            return None
            
        try:
            # 准备分析提示词
            prompt = self._build_analysis_prompt(observation)
            
            # 调用LLM进行分析
            analysis_text = await self.llm.generate(
                prompt=prompt,
                max_tokens=1000,
                temperature=0.3  # 较低温度以确保分析一致性
            )
            
            # 解析LLM响应
            return self._parse_analysis_response(analysis_text, observation)
            
        except Exception as e:
            print(f"分析观察记录失败: {e}")
            return None
    
    def _build_analysis_prompt(self, observation: Dict[str, Any]) -> str:
        """构建分析提示词"""