/**
 * observation_analyzer.js
 * 
 * 技能：观察数据分析器
 * 描述：监控 observations_unanalyzed 计数器，当值 >= 1 时触发分析流程，
 *       执行观察数据的分析、分类、关联记忆存储，并重置计数器。
 */

const logger = require('../utils/logger');
const memoryStore = require('../services/memoryStore');
const observationSource = require('../services/observationSource');

/**
 * 观察数据分类规则映射
 */
const CLASSIFICATION_RULES = [
  {
    type: 'error',
    keywords: ['error', 'fail', 'exception', 'crash', 'fatal', 'panic', 'critical', 'bug', '故障', '错误', '失败', '异常', '崩溃']
  },
  {
    type: 'warning',
    keywords: ['warning', 'warn', 'caution', 'alert', 'deprecat', 'timeout', 'slow', 'retry', '警告', '注意', '超时', '重试']
  },
  {
    type: 'info',
    keywords: ['info', 'success', 'complete', 'start', 'finish', 'connect', 'disconnect', 'info', '信息', '成功', '完成', '启动']
  },
  {
    type: 'debug',
    keywords: ['debug', 'trace', 'verbose', 'log', 'dump', '调试', '跟踪', '日志']
  }
];

/**
 * 默认分类类型
 */
const DEFAULT_CLASSIFICATION = 'unknown';

/**
 * 根据内容对观察数据进行分类
 * @param {string} content - 观察数据内容
 * @returns {string} 分类结果
 */
function classifyObservation(content) {
  if (!content || typeof content !== 'string') {
    return DEFAULT_CLASSIFICATION;
  }

  const lowerContent = content.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        return rule.type;
      }
    }
  }

  return DEFAULT_CLASSIFICATION;
}

/**
 * 关联历史记忆：根据分类和内容搜索相关记忆条目
 * @param {string} type - 观察分类类型
 * @param {string} content - 观察数据内容
 * @param {number} timestamp - 观察时间戳
 * @returns {Promise<Array>} 关联的记忆ID列表
 */
async function findRelatedMemories(type, content, timestamp) {
  const relatedMemoryIds = [];

  try {
    // 构建搜索关键词：提取内容中有意义的词汇
    const keywords = extractKeywords(content);

    // 搜索同类型的历史记忆
    const typeResults = await memoryStore.search({
      type: type,
      limit: 5,
      sortBy: 'timestamp',
      order: 'desc'
    });

    if (typeResults && typeResults.length > 0) {
      for (const memory of typeResults) {
        relatedMemoryIds.push(memory.id);
      }
    }

    // 基于关键词搜索相关记忆
    if (keywords.length > 0) {
      const keywordResults = await memoryStore.search({
        keywords: keywords,
        limit: 5,
        sortBy: 'relevance'
      });

      if (keywordResults && keywordResults.length > 0) {
        for (const memory of keywordResults) {
          if (!relatedMemoryIds.includes(memory.id)) {
            relatedMemoryIds.push(memory.id);
          }
        }
      }
    }

    // 搜索近期时间窗口内的记忆（前后5分钟）
    const timeWindow = 5 * 60 * 1000; // 5分钟
    const timeResults = await memoryStore.search({
      timestampFrom: timestamp - timeWindow,
      timestampTo: timestamp + timeWindow,
      limit: 3
    });

    if (timeResults && timeResults.length > 0) {
      for (const memory of timeResults) {
        if (!relatedMemoryIds.includes(memory.id)) {
          relatedMemoryIds.push(memory.id);
        }
      }
    }
  } catch (error) {
    logger.error('[ObservationAnalyzer] 搜索关联记忆失败', {
      error: error.message,
      type,
      content: content.substring(0, 100)
    });
  }

  return relatedMemoryIds;
}

/**
 * 从内容中提取关键词
 * @param {string} content - 文本内容
 * @returns {string[]} 关键词数组
 */
function extractKeywords(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // 移除常见停用词，提取有意义的词汇
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
    'than', 'too', 'very', 'just', 'about', '的', '了', '在', '是', '我',
    '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
    '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己'
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // 去重并限制数量
  const uniqueWords = [...new Set(words)];
  return uniqueWords.slice(0, 10);
}

/**
 * 生成观察分析摘要
 * @param {object} observation - 原始观察数据
 * @param {string} classification - 分类结果
 * @param {Array} relatedMemoryIds - 关联记忆ID列表
 * @returns {object} 分析摘要
 */
function generateSummary(observation, classification, relatedMemoryIds) {
  const content = observation.content || '';
  const shortDescription = content.length > 200 
    ? content.substring(0, 200) + '...' 
    : content;

  return {
    classification: classification,
    relatedMemoryIds: relatedMemoryIds,
    description: shortDescription,
    source: observation.source || 'unknown',
    originalTimestamp: observation.timestamp || Date.now(),
    analyzedAt: Date.now()
  };
}

/**
 * 将分析结果存入系统记忆
 * @param {object} summary - 分析摘要
 * @returns {Promise<string>} 存储的记忆ID
 */
async function storeAnalysisResult(summary) {
  const memoryEntry = {
    type: 'observation_analysis',
    category: summary.classification,
    content: JSON.stringify({
      classification: summary.classification,
      relatedMemoryIds: summary.relatedMemoryIds,
      description: summary.description,
      source: summary.source
    }),
    metadata: {
      originalTimestamp: summary.originalTimestamp,
      analyzedAt: summary.analyzedAt,
      relatedMemoryIds: summary.relatedMemoryIds,
      classification: summary.classification,
      source: summary.source
    },
    timestamp: Date.now(),
    tags: ['observation', 'analysis', summary.classification]
  };

  try {
    const memoryId = await memoryStore.add(memoryEntry);
    logger.info('[ObservationAnalyzer] 分析结果已存入记忆', {
      memoryId,
      classification: summary.classification,
      relatedCount: summary.relatedMemoryIds.length
    });
    return memoryId;
  } catch (error) {
    logger.error('[ObservationAnalyzer] 存储分析结果失败', {
      error: error.message,
      summary
    });
    throw error;
  }
}

/**
 * 获取系统状态中的 observations_unanalyzed 计数器值
 * @returns {Promise<number>} 未分析观察数据数量
 */
async function getUnanalyzedCount() {
  try {
    if (typeof observationSource.getUnanalyzedCount === 'function') {
      return await observationSource.getUnanalyzedCount();
    }
    // 回退：假设 observationSource 提供状态对象
    const status = await observationSource.getStatus();
    return status.observations_unanalyzed || 0;
  } catch (error) {
    logger.error('[ObservationAnalyzer] 获取未分析计数失败', {
      error: error.message