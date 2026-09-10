import json
import os
import re
from collections import Counter
from datetime import datetime
from typing import List, Dict, Any, Optional


def analyze_pending_observations(
    observations_list: List[Dict[str, Any]],
    context: Dict[str, Any] = None,
    analysis_depth: str = "fast"
) -> Dict[str, Any]:
    """
    分析待处理的观察数据，提取模式、问题和建议
    
    参数:
        observations_list: 待分析的观察数据列表
        context: 当前上下文（如循环计数、目标等）
        analysis_depth: 分析深度 - "fast"(仅关键词) 或 "detailed"(包含聚类分析)
        
    返回:
        包含分析结果的字典
    """
    
    if context is None:
        context = {}
    
    # 初始化结果结构
    analysis_result = {
        "analysis_timestamp": datetime.now().isoformat(),
        "analysis_depth": analysis_depth,
        "context": context,
        "summary": "",
        "identified_patterns": [],
        "suggestions": [],
        "processed_indices": [],
        "error_count": 0,
        "warning_count": 0
    }
    
    if not observations_list:
        analysis_result["summary"] = "没有待分析的观察数据"
        return analysis_result
    
    # 提取文本内容
    text_contents = []
    for idx, obs in enumerate(observations_list):
        if isinstance(obs, dict):
            # 尝试从常见字段提取文本
            text_content = obs.get("text", "") or obs.get("content", "") or obs.get("message", "") or str(obs)
        else:
            text_content = str(obs)
        
        text_contents.append(text_content)
        analysis_result["processed_indices"].append(idx)
    
    # 1. 高频关键词/模式分析
    keywords = extract_keywords(text_contents, analysis_depth)
    analysis_result["identified_patterns"] = keywords[:20]  # 保留前20个高频关键词
    
    # 2. 识别潜在问题或异常信号
    problem_indicators = identify_problems(text_contents)
    analysis_result["error_count"] = problem_indicators["errors"]
    analysis_result["warning_count"] = problem_indicators["warnings"]
    
    # 3. 提取改进建议
    suggestions = extract_suggestions(text_contents, problem_indicators, context)
    analysis_result["suggestions"] = suggestions
    
    # 4. 生成分析摘要
    analysis_result["summary"] = generate_summary(
        len(observations_list), 
        keywords, 
        problem_indicators, 
        suggestions
    )
    
    # 5. 保存结果到文件
    save_analysis_results(analysis_result)
    
    return analysis_result


def extract_keywords(text_list: List[str], depth: str = "fast") -> List[str]:
    """提取高频关键词"""
    
    # 合并所有文本
    all_text = " ".join(text_list).lower()
    
    # 简单的预处理：移除标点符号
    all_text = re.sub(r'[^\w\s]', ' ', all_text)
    
    # 分词（简单按空格分割）
    words = all_text.split()
    
    # 常见停用词列表
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
        'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs'
    }
    
    # 过滤停用词和短词