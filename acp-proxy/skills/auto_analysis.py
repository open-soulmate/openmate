# acp-proxy/skills/auto_analysis.py
import datetime
from typing import List, Dict, Any, Optional

class AutoAnalysisSkill:
    """
    自动分析技能：将过量的观察（observations）转化为结构化的洞察（insights）。
    解决信息过载与处理滞后问题，提升知识积累效率。
    """

    # 触发阈值配置
    UNANALYZED_THRESHOLD = 3

    def __init__(self, context: Any = None):
        """
        初始化技能，可传入上下文以访问记忆系统等。
        """
        self.context = context
        self.skill_name = "auto_analysis"
        self.description = "批量分析未处理的观察，生成洞察并写入记忆系统"

    def should_trigger(self, observations_unanalyzed_count: int) -> bool:
        """
        判断是否应该触发此技能。
        当未分析的观察数量达到或超过阈值时返回True。
        """
        return observations_unanalyzed_count >= self.UNANALYZED_THRESHOLD

    def execute(self, force: bool = False) -> str:
        """
        执行自动分析流程。
        
        参数:
            force: 是否强制执行，忽略阈值检查
            
        返回:
            分析报告字符串
        """
        # 1. 检查并获取未分析的观察
        if not force:
            # 假设context提供了获取未分析观察数量的方法
            # 在实际实现中，需要替换为真实的API调用
            unanalyzed_count = self._get_unanalyzed_count()
            if not self.should_trigger(unanalyzed_count):
                return f"未达到触发阈值({self.UNANALYZED_THRESHOLD})，当前未分析观察数: {unanalyzed_count}"

        # 获取所有未分析的观察
        unanalyzed_observations = self._fetch_unanalyzed_observations()
        if not unanalyzed_observations:
            return "没有找到未分析的观察"

        # 2. 批量分析
        deduplicated = self._deduplicate_observations(unanalyzed_observations)
        clustered = self._cluster_observations(deduplicated)
        insights = self._extract_insights(clustered)

        # 3. 格式化为记忆条目
        memory_entries = self._format_as_memories(insights)

        # 4. 存入记忆系统并标记原始观察为已分析
        self._store_memories(memory_entries)
        self._mark_observations_as_analyzed(unanalyzed_observations)

        # 5. 生成分析报告
        report = self._generate_report(
            observations_processed=len(unanalyzed_observations),
            insights_generated=len(memory_entries)
        )

        return report

    def _get_unanalyzed_count(self) -> int:
        """获取未分析观察的数量（模拟实现）"""
        # 实际实现中应调用 context.memories.count_unanalyzed() 或类似方法
        if hasattr(self.context, 'memories') and hasattr(self.context.memories, 'count_unanalyzed'):
            return self.context.memories.count_unanalyzed()
        
        # 模拟数据：实际使用时替换为真实逻辑
        return 0

    def _fetch_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """获取所有未分析的观察（模拟实现）"""
        # 实际实现中应调用 context.memories.get_unanalyzed() 或类似方法
        if hasattr(self.context, 'memories') and hasattr(self.context.memories, 'get_unanalyzed'):
            return self.context.memories.get_unanalyzed()
        
        # 模拟数据：实际使用时替换为真实逻辑
        return [
            {"id": 1, "content": "用户询问了天气情况", "type": "query", "tags": ["weather"], "timestamp": "2023-01-01T10:00:00"},
            {"id": 2, "content": "系统检测到性能下降", "type": "alert", "tags": ["performance", "system"], "timestamp": "2023-01-01T10:05:00"},
            {"id": 3, "content": "用户询问了天气情况", "type": "query", "tags": ["weather"], "timestamp": "2023-01-01T10:10:00"},
            {"id": 4, "content": "数据库连接超时", "type": "error", "tags": ["database", "connection"], "timestamp": "2023-01-01T10:15:00"},
        ]

    def _deduplicate_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """去重处理：基于内容和类型去除重复观察"""
        seen = set()
        unique_observations = []
        
        for obs in observations:
            # 创建唯一标识：内容+类型
            key = (obs.get('content', ''), obs.get('type', ''))
            if key not in seen:
                seen.add(key)
                unique_observations.append(obs)
        
        return unique_observations

    def _cluster_observations(self, observations: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """按类型/标签聚类观察"""
        clusters = {}
        
        for obs in observations:
            # 按类型聚类
            obs_type = obs.get('type', 'unknown')
            if obs_type not in clusters:
                clusters[obs_type] = []
            clusters[obs_type].append(obs)
        
        return clusters

    def _extract_insights(self, clustered_observations: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """从聚类中提取洞察（简化实现：提取关键实体和动作）"""
        insights = []
        
        for cluster_type, observations in clustered_observations.items():
            # 简化实现：提取关键词作为实体
            all_tags = set()
            all_content = []
            
            for obs in observations:
                all_content.append(obs.get('content', ''))
                all_tags.update(obs.get('tags', []))
            
            # 创建洞察条目
            insight = {
                "type": "insight",
                "source": "auto_analysis",
                "cluster_type": cluster_type,
                "observations_count": len(observations),
                "key_entities": list(all_tags),
                "summary": f"分析了{len(observations)}个{cluster_type}类型观察",
                "sample_content": all_content[:3],  # 最多保留3个样本内容
                "timestamp": datetime.datetime.now().isoformat()
            }
            insights.append(insight)
        
        return insights

    def _format_as_memories(self, insights: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """将洞察格式化为记忆条目"""
        memory_entries = []
        
        for i, insight in enumerate(insights):
            memory_entry = {
                "id": f"insight_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{i}",
                "type": "insight",
                "source": "auto_analysis",
                "content": insight,
                "timestamp": datetime.datetime.now().isoformat(),
                "metadata": {
                    "generated_by": "auto_analysis_skill",
                    "cluster_type": insight.get("cluster_type", "unknown"),
                    "observations_count": insight.get("observations_count", 0)
                }
            }
            memory_entries.append(memory_entry)
        
        return memory_entries

    def _store_memories(self, memory_entries: List[Dict[str, Any]]) -> bool:
        """将记忆条目存入记忆系统（模拟实现）"""
        # 实际实现中应调用 context.memories.store() 或类似方法
        if hasattr(self.context, 'memories') and hasattr(self.context.memories, 'store'):
            for entry in memory_entries:
                self.context.memories.store(entry)
            return True
        
        # 模拟存储成功
        print(f"[AutoAnalysis] 存储了 {len(memory_entries)} 条记忆条目（模拟）")
        return True

    def _mark_observations_as_analyzed(self, observations: List[Dict[str, Any]]) -> bool:
        """将原始观察标记为已分析（模拟实现）"""
        # 实际实现中应调用 context.memories.mark_as_analyzed() 或类似方法