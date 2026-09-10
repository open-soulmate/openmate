const logger = require('../utils/logger');
const memoryStore = require('../memory/memoryStore');

// 分类规则配置
const CLASSIFICATION_RULES = {
  error: ['error', 'fail', 'exception', 'critical', 'fatal'],
  warning: ['warning', 'warn', 'alert', 'caution', 'issue'],
  info: ['info', 'information', 'notice', 'log', 'debug']
};

// 获取系统状态（假设从全局状态或配置中获取）
let globalState = global.observationsState || {};

function updateGlobalState(state) {
  global.observationsState = state;
}

// 获取未分析的观察数据
async function fetchUnanalyzedObservations() {
  try {
    // 这里需要根据实际系统实现，可能从日志文件、数据库或缓存中读取
    // 假设有一个全局的observations缓存
    if (!global.unanalyzedObservations) {
      global.unanalyzedObservations = [];
    }
    
    // 复制当前待处理数据
    const observations = [...global.unanalyzedObservations];
    
    // 清空缓存，避免重复处理
    global.unanalyzedObservations = [];
    
    return observations;
  } catch (error) {
    logger.error('Failed to fetch unanalyzed observations', { error: error.message });
    throw error;
  }
}

// 分类观察数据
function classifyObservation(content) {
  const lowerContent = content.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CLASSIFICATION_RULES)) {
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'info'; // 默认分类
}

// 关联历史记忆
async function findRelatedMemories(category, content, timestamp) {
  try {
    const searchQuery = {
      type: category,
      timestamp: {
        $gte: timestamp - 24 * 60 * 60 * 1000, // 最近24小时
        $lte: timestamp + 60 * 1000 // 允许1分钟时间差
      },
      $or: [
        { content: { $regex: content.substring(0, 50), $options: 'i' } },
        { keywords: { $in: extractKeywords(content) } }
      ]
    };
    
    const relatedMemories = await memoryStore.search(searchQuery, {
      limit: 10,
      sort: { timestamp: -1 }
    });
    
    return relatedMemories.map(memory => memory.id);
  } catch (error) {
    logger.warn('Failed to find related memories', { 
      error: error.message,
      category,
      content: content.substring(0, 100)
    });
    return [];
  }
}

// 提取关键词（简单实现）
function extractKeywords(content) {
  // 移除常见停用词，提取有意义的词
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 10); // 最多10个关键词
}

// 生成分析摘要
function generateAnalysisSummary(observation, category, relatedMemoryIds) {
  const summary = {
    id: `obs_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    originalObservation: {
      id: observation.id,
      content: observation.content,
      source: observation.source || 'unknown',
      receivedAt: observation.receivedAt || Date.now()
    },
    analysis: {
      category: category,
      confidence: calculateConfidence(observation.content, category),
      relatedMemoryIds: relatedMemoryIds,
      keywords: extractKeywords(observation.content),
      sentiment: analyzeSentiment(observation.content)
    },
    processedBy: 'observation_analyzer',
    version: '1.0.0'
  };
  
  return summary;
}

// 计算分类置信度（简单实现）
function calculateConfidence(content, category) {
  const keywords = CLASSIFICATION_RULES[category] || [];
  const matches = keywords.filter(keyword => 
    content.toLowerCase().includes(keyword)
  ).length;
  
  return Math.min(matches / 2, 1); // 简单置信度计算
}

// 简单情感分析
function analyzeSentiment(content) {
  const positiveWords = ['success', 'good', 'great', 'excellent', 'complete'];
  const negativeWords = ['error', 'fail', 'bad', 'wrong', 'issue'];
  
  const lowerContent = content.toLowerCase();
  let score = 0;
  
  positiveWords.forEach(word => {
    if (lowerContent.includes(word)) score++;
  });
  
  negativeWords.forEach(word => {
    if (lowerContent.includes(word)) score--;
  });
  
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

// 存储分析结果到记忆系统
async function storeAnalysisResult(analysisSummary) {
  try {
    const memoryEntry = {
      type: 'observation_analysis',
      category: analysisSummary.analysis.category,
      content: analysisSummary,
      timestamp: analysisSummary.timestamp,
      source: 'observation_analyzer',
      relatedTo: analysisSummary.analysis.relatedMemoryIds,
      searchableContent: [
        analysisSummary.originalObservation.content,
        analysisSummary.analysis.category,
        ...analysisSummary.analysis.keywords
      ].join(' ').toLowerCase()
    };
    
    const storedMemory = await memoryStore.add(memoryEntry);
    
    logger.info('Analysis result stored in memory', {
      analysisId: analysisSummary.id,
      memoryId: storedMemory.id,
      category: analysisSummary.analysis.category
    });
    
    return storedMemory.id;
  } catch (error) {
    logger.error('Failed to store analysis result', { 
      error: error.message,
      analysisId: analysisSummary.id
    });
    throw error;
  }
}

// 记录分析完成事件
function logAnalysisCompletion(processedCount, startTime) {
  const duration = Date.now() - startTime;
  
  logger.info('Observation analysis completed', {
    processedCount,
    duration,
    timestamp: Date.now()
  });
  
  // 可以添加监控指标上报
  if (global.metrics) {
    global.metrics.counter('observations_analyzed').inc(processedCount);
    global.metrics.histogram('analysis_duration_ms').observe(duration);
  }
}

// 主分析函数
async function analyzeObservations() {
  const startTime = Date.now();
  
  try {
    // 检查待处理观察数量
    const unanalyzedCount = globalState.observations_unanalyzed || 0;
    
    if (unanalyzedCount < 1) {
      logger.debug('No unanalyzed observations to process', { count: unanalyzedCount });