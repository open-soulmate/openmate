// acp-proxy/skills/observation_analyzer.js
const logger = require('../utils/logger');
const memoryStore = require('../memory/memoryStore');
const stateManager = require('../state/stateManager');
const observationDataSource = require('../data/observationDataSource');

/**
 * 分类观察数据
 * @param {Object} observation - 观察数据对象
 * @returns {string} - 分类标签
 */
function classifyObservation(observation) {
  const content = observation.content || '';
  const normalizedContent = content.toLowerCase();
  
  if (normalizedContent.includes('error') || 
      normalizedContent.includes('exception') ||
      normalizedContent.includes('failed') ||
      normalizedContent.includes('故障') ||
      normalizedContent.includes('错误')) {
    return 'error';
  }
  
  if (normalizedContent.includes('warning') || 
      normalizedContent.includes('warn') ||
      normalizedContent.includes('异常') ||
      normalizedContent.includes('警告')) {
    return 'warning';
  }
  
  if (normalizedContent.includes('success') || 
      normalizedContent.includes('completed') ||
      normalizedContent.includes('完成') ||
      normalizedContent.includes('成功')) {
    return 'success';
  }
  
  return 'info';
}

/**
 * 关联历史记忆
 * @param {Object} observation - 当前观察数据
 * @param {string} category - 分类结果
 * @returns {Promise<Array>} - 关联的记忆ID列表
 */
async function associateWithMemories(observation, category) {
  try {
    const query = {
      category: category,
      timestamp: {
        $gte: new Date(observation.timestamp - 24 * 60 * 60 * 1000), // 24小时内
        $lte: new Date(observation.timestamp.getTime() + 60 * 60 * 1000) // 1小时内
      },
      limit: 5
    };
    
    const relatedMemories = await memoryStore.search(query);
    return relatedMemories.map(memory => memory.id);
  } catch (error) {
    logger.warn(`关联记忆失败: ${error.message}`);
    return [];
  }
}

/**
 * 生成分析摘要
 * @param {Object} observation - 观察数据
 * @param {string} category - 分类
 * @param {Array} relatedMemoryIds - 关联的记忆ID
 * @returns {string} - 分析摘要
 */
function generateSummary(observation, category, relatedMemoryIds) {
  const time = observation.timestamp.toISOString();
  const relatedCount = relatedMemoryIds.length;
  
  return `观察分析完成 - 时间: ${time}, 类型: ${category}, 关联记忆: ${relatedCount}条, 内容摘要: ${observation.content.substring(0, 100)}`;
}

/**
 * 存储分析结果到记忆
 * @param {Object} observation - 原始观察数据
 * @param {string} category - 分类结果
 * @param {Array} relatedMemoryIds - 关联的记忆ID
 * @param {string} summary - 分析摘要
 * @returns {Promise<string>} - 存储的记忆ID
 */
async function storeAnalysisResult(observation, category, relatedMemoryIds, summary) {
  const memoryEntry = {
    type: 'observation_analysis',
    category: category,
    timestamp: new Date(),
    relatedTo: relatedMemoryIds,
    content: summary,
    metadata: {
      sourceObservationId: observation.id,
      originalTimestamp: observation.timestamp,
      processedAt: new Date().toISOString()
    }
  };
  
  return await memoryStore.add(memoryEntry);
}

/**
 * 主分析函数
 * @returns {Promise<Object>} - 分析结果
 */
async function analyzeObservations() {
  try {
    // 获取未分析观察数量
    const unanalyzedCount = await stateManager.get('observations_unanalyzed');
    
    if (unanalyzedCount < 1) {
      logger.debug('无未分析观察数据，跳过处理');
      return { processed: false, reason: 'no_unanalyzed_observations' };
    }
    
    logger.info(`开始处理 ${unanalyzedCount} 条未分析观察`);
    
    // 获取未分析的观察数据
    const observations = await observationDataSource.getUnanalyzed(unanalyzedCount);
    
    if (!observations || observations.length === 0) {
      logger.warn('获取观察数据失败或为空');
      return { processed: false, reason: 'fetch_failed' };
    }
    
    const results = [];
    
    // 处理每条观察
    for (const observation of observations) {
      try {
        // 1. 分类观察
        const category = classifyObservation(observation);
        
        // 2. 关联历史记忆
        const relatedMemoryIds = await associateWithMemories(observation, category);
        
        // 3. 生成摘要
        const summary = generateSummary(observation, category, relatedMemoryIds);
        
        // 4. 存储分析结果