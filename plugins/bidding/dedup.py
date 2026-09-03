"""投标文档引擎 — 查重引擎

基于 TF-IDF + 余弦相似度检测：
1. 投标文件内章节间的重复
2. 与公开资料的相似度
3. 模板化内容识别
"""

import logging
import math
import re
from collections import Counter
from typing import Optional

from .models import OutlineNode, Project

logger = logging.getLogger("acp-proxy.bidding.dedup")


def _tokenize(text: str) -> list[str]:
    """中文分词（简单按字/词切分）"""
    # 去除标点和空白
    text = re.sub(r'[^\u4e00-\u9fff\w]', ' ', text)
    # 按2-4字滑动窗口切分（简易中文分词）
    tokens = []
    for n in (2, 3, 4):
        for i in range(len(text) - n + 1):
            gram = text[i:i+n].strip()
            if len(gram) == n:
                tokens.append(gram)
    return tokens


def _tfidf_vector(tokens: list[str], idf: dict[str, float]) -> dict[str, float]:
    """计算 TF-IDF 向量"""
    tf = Counter(tokens)
    total = len(tokens) or 1
    vector = {}
    for term, count in tf.items():
        tf_val = count / total
        idf_val = idf.get(term, 1.0)
        vector[term] = tf_val * idf_val
    return vector


def _cosine_similarity(v1: dict[str, float], v2: dict[str, float]) -> float:
    """计算两个稀疏向量的余弦相似度"""
    common = set(v1.keys()) & set(v2.keys())
    if not common:
        return 0.0
    dot = sum(v1[k] * v2[k] for k in common)
    norm1 = math.sqrt(sum(v ** 2 for v in v1.values()))
    norm2 = math.sqrt(sum(v ** 2 for v in v2.values()))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def _build_idf(corpus: list[list[str]]) -> dict[str, float]:
    """构建 IDF 字典"""
    n = len(corpus) or 1
    doc_freq: Counter = Counter()
    for doc in corpus:
        doc_freq.update(set(doc))
    return {term: math.log(n / (df + 1)) + 1 for term, df in doc_freq.items()}


def check_similarity(text1: str, text2: str) -> float:
    """计算两段文本的相似度

    Args:
        text1: 文本1
        text2: 文本2

    Returns:
        相似度分数 (0.0 ~ 1.0)
    """
    if not text1.strip() or not text2.strip():
        return 0.0

    tokens1 = _tokenize(text1)
    tokens2 = _tokenize(text2)

    if not tokens1 or not tokens2:
        return 0.0

    idf = _build_idf([tokens1, tokens2])
    v1 = _tfidf_vector(tokens1, idf)
    v2 = _tfidf_vector(tokens2, idf)

    return _cosine_similarity(v1, v2)


def _collect_chapters(node: OutlineNode, path: str = "") -> list[tuple[str, str]]:
    """递归收集所有章节内容"""
    chapters = []
    current_path = f"{path}/{node.title}" if path else node.title
    if node.content:
        chapters.append((current_path, node.content))
    for child in node.children:
        chapters.extend(_collect_chapters(child, current_path))
    return chapters


def find_duplicates(project: Project, threshold: float = 0.3) -> list[dict]:
    """查找项目内的重复内容

    Args:
        project: 投标项目
        threshold: 相似度阈值（默认0.3）

    Returns:
        重复内容对列表，每项包含 path1, path2, similarity, preview
    """
    if not project.outline:
        return []

    chapters = _collect_chapters(project.outline)
    if len(chapters) < 2:
        return []

    # 构建全局 IDF
    all_tokens = [_tokenize(text) for _, text in chapters]
    idf = _build_idf(all_tokens)

    # 计算所有章节的 TF-IDF 向量
    vectors = [_tfidf_vector(tokens, idf) for tokens in all_tokens]

    # 两两比较
    duplicates = []
    n = len(chapters)
    for i in range(n):
        for j in range(i + 1, n):
            sim = _cosine_similarity(vectors[i], vectors[j])
            if sim >= threshold:
                # 生成预览
                text1 = chapters[i][1][:200]
                text2 = chapters[j][1][:200]
                duplicates.append({
                    "path1": chapters[i][0],
                    "path2": chapters[j][0],
                    "similarity": round(sim, 3),
                    "preview1": text1,
                    "preview2": text2,
                })

    # 按相似度降序排序
    duplicates.sort(key=lambda x: x["similarity"], reverse=True)

    logger.info(f"查重完成: {n} 个章节, {len(duplicates)} 对重复 (阈值={threshold})")
    return duplicates


def find_template_content(project: Project, threshold: float = 0.7) -> list[dict]:
    """识别模板化内容（与通用模板高度相似的段落）

    Args:
        project: 投标项目
        threshold: 相似度阈值

    Returns:
        模板化内容列表
    """
    # 常见模板句式
    template_phrases = [
        "我公司具有丰富的项目实施经验",
        "我们将严格按照招标文件要求",
        "我公司拥有专业的技术团队",
        "我们将提供完善的售后服务",
        "我公司具有良好的财务状况",
        "我们将确保项目按时按质完成",
        "我公司具有良好的信誉和口碑",
        "我们将以最优质的服务",
        "如有幸中标，我公司将",
        "我公司郑重承诺",
    ]

    if not project.outline:
        return []

    chapters = _collect_chapters(project.outline)
    template_matches = []

    for path, content in chapters:
        for phrase in template_phrases:
            if phrase in content:
                template_matches.append({
                    "path": path,
                    "phrase": phrase,
                    "type": "模板化表述",
                })

    return template_matches
