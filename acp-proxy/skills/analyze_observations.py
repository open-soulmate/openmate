import json
import os
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

class ObservationAnalyzer:
    """分析待处理观察数据的技能模块"""
    
    def __init__(self, config=None):
        self.config = config or {}
        self.learning_logs_dir = Path("learning_logs")
        self.learning_logs_dir.mkdir(exist_ok=True)
        
    def analyze_pending_observations(self, observations_list, context=None, depth="detailed"):
        """
        分析待处理的观察数据
        
        Args:
            observations_list: 待分析的观察数据列表
            context: 当前上下文信息，如最近循环计数、当前目标
            depth: 分析深度，可选"fast"或"detailed"
            
        Returns:
            dict: 分析结果，包含分析摘要、模式列表、建议改进项等
        """
        if context is None:
            context = {}
            
        # 初始化分析结果
        analysis_result = {
            "timestamp": datetime.now().isoformat(),
            "analysis_depth": depth,
            "summary": "",
            "patterns": [],
            "suggestions": [],
            "processed_indices": [],
            "statistics": {}
        }
        
        # 验证输入数据
        if not observations_list:
            analysis_result["summary"] = "没有待分析的观察数据"
            return analysis_result
            
        # 执行分析
        try:
            # 1. 基础统计
            analysis_result["statistics"] = self._compute_statistics(observations_list)
            
            # 2. 根据分析深度执行不同复杂度的分析
            if depth == "fast":
                analysis_result = self._fast_analysis(observations_list, context, analysis_result)
            else:  # detailed
                analysis_result = self._detailed_analysis(observations_list, context, analysis_result)
            
            # 3. 标记处理的索引
            analysis_result["processed_indices"] = list(range(len(observations_list)))
            
            # 4. 生成分析摘要
            analysis_result["summary"] = self._generate_summary(
                len(observations_list),
                analysis_result["patterns"],
                analysis_result["suggestions"],
                depth
            )
            
            # 5. 保存结果到文件
            self._save_analysis_result(analysis_result)
            
        except Exception as e:
            analysis_result["summary"] = f"分析过程中发生错误: {str(e)}"
            analysis_result["error"] = str(e)
            
        return analysis_result
    
    def _fast_analysis(self, observations_list, context, analysis_result):
        """快速分析：仅关键词匹配"""
        # 1. 提取文本内容
        texts = self._extract_texts(observations_list)
        
        # 2. 识别高频关键词
        keywords = self._extract_keywords(texts)
        analysis_result["patterns"].extend(keywords[:10])  # 取前10个高频关键词
        
        # 3. 标记潜在问题
        problems = self._identify_problems_fast(texts, keywords)
        analysis_result["patterns"].extend(problems)
        
        # 4. 生成快速建议
        suggestions = self._generate_suggestions_fast(problems, context)
        analysis_result["suggestions"].extend(suggestions)
        
        return analysis_result
    
    def _detailed_analysis(self, observations_list, context, analysis_result):
        """详细分析：包含简单聚类分析"""
        # 1. 提取文本内容
        texts = self._extract_texts(observations_list)
        
        # 2. 模式识别 - 高频关键词
        keywords = self._extract_keywords(texts)
        analysis_result["patterns"].append({
            "type": "high_frequency_keywords",
            "keywords": keywords[:15],
            "count": len(keywords)
        })
        
        # 3. 模式识别 - 趋势分析
        trends = self._analyze_trends(observations_list, texts)
        analysis_result["patterns"].append({
            "type": "trends",
            "details": trends
        })
        
        # 4. 模式识别 - 聚类分析
        clusters = self._simple_cluster_analysis(texts)
        analysis_result["patterns"].append({
            "type": "clusters",
            "clusters": clusters
        })
        
        # 5. 问题识别
        problems = self._identify_problems_detailed(texts, keywords, trends, clusters)
        analysis_result["patterns"].append({
            "type": "potential_problems",
            "problems": problems
        })
        
        # 6. 建议生成