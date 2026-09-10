import json
from collections import Counter
from typing import Dict, List, Any
from acp_proxy.skills import Skill, registry

class ObservationAnalyzerSkill(Skill):
    """内置观察分析技能，用于处理积压的observations_unanalyzed。"""
    
    name = "observation_analyzer"
    description = "分析观察数据，识别模式，生成洞察和建议行动。"
    
    def execute(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """执行观察分析。
        
        Args:
            data: 包含observation_text或observation_list字段的字典。
            
        Returns:
            结构化分析结果，包含analysis_summary, identified_patterns, suggested_actions。
        """
        # 获取观察数据
        observation_text = data.get("observation_text", "")
        observation_list = data.get("observation_list", [])
        
        # 合并观察列表为文本（如果提供列表）
        if observation_list and not observation_text:
            observation_text = "\n".join(observation_list)
        
        if not observation_text:
            return {
                "analysis_summary": "没有提供观察数据，无法进行分析。",
                "identified_patterns": [],
                "suggested_actions": ["提供观察数据以开始分析。"]
            }
        
        # 1. 关键词提取和频率统计
        keywords = self._extract_keywords(observation_text)
        keyword_freq = Counter(keywords)
        top_keywords = keyword_freq.most_common(10)
        
        # 2. 模式识别（简单规则）
        patterns = self._identify_patterns(observation_text, keyword_freq)
        
        # 3. 生成总结
        summary = self._generate_summary(observation_text, top_keywords, patterns)
        
        # 4. 建议行动
        actions = self._suggest_actions(patterns)
        
        return {
            "analysis_summary": summary,
            "identified_patterns": patterns,
            "suggested_actions": actions,
            "top_keywords": [kw for kw, count in top_keywords]  # 额外信息，可忽略或保留
        }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """提取关键词（简单实现：按空格分词并过滤短词）。"""
        words = text.lower().split()
        # 过滤长度小于2的词，可扩展为更复杂的停用词表
        keywords = [word.strip(".,!?;:\"'()[]{}") for word in words if len(word) > 2]
        return keywords
    
    def _identify_patterns(self, text: str, keyword_freq: Counter) -> List[str]:
        """识别模式：基于关键词频率和简单规则。"""
        patterns = []
        text_lower = text.lower()
        
        # 成功模式识别
        success_words = ["成功", "实现", "完成", "突破", "胜利", "达成", "成功"]
        if any(word in text_lower for word in success_words):
            patterns.append("成功模式")
        
        # 失败模式识别
        failure_words = ["失败", "错误", "问题", "障碍", "挑战", "困难", "未能"]
        if any(word in text_lower for word in failure_words):
            patterns.append("失败模式")
        
        # 趋势模式识别
        trend_words = ["增加", "减少", "上升", "下降", "改善", "恶化"]
        if any(word in text_lower for word in trend_words):
            patterns.append("趋势变化")
        
        # 如果没有识别到模式，返回通用模式
        if not patterns:
            patterns.append("常规观察")
        
        return patterns
    
    def _generate_summary(self, text: str, top_keywords: List[tuple], patterns: List[str]) -> str:
        """生成分析总结。"""
        # 简单总结：基于模式和高频关键词
        summary_parts = []
        
        if "成功模式" in patterns:
            summary_parts.append("观察中存在积极成果。")
        if "失败模式" in patterns:
            summary_parts.append("观察中存在需要改进的问题。")
        if "趋势变化" in patterns:
            summary_parts.append("观察到某种趋势变化。")
        
        # 添加高频关键词信息
        if top_keywords:
            kw_str = ", ".join([kw for kw, _ in top_keywords[:5]])
            summary_parts.append(f"主要关注点包括：{kw_str}。")
        
        return " ".join(summary_parts) if summary_parts else "分析完成，未识别明显模式。"
    
    def _suggest_actions(self, patterns: List[str]) -> List[str]:
        """根据模式建议行动。"""
        actions = []
        
        if "成功模式" in patterns:
            actions.append("记录成功经验，纳入知识库以便复用。")
        if "失败模式" in patterns:
            actions.append("分析失败原因，制定改进计划。")
        if "趋势变化" in patterns:
            actions.append("监控趋势，评估影响并调整策略。")
        
        # 通用行动
        actions.append("将分析结果存入知识库，供决策参考。")
        
        return actions

# 注册技能
registry.register(ObservationAnalyzerSkill)