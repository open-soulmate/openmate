const logger = require('../utils/logger');
const systemState = require('../core/systemState');
const observationDataSource = require('../data/observationDataSource');
const memoryStore = require('../memory/memoryStore');

/**
 * 分类观察数据
 * @param {Object} observation - 观察数据对象
 * @returns {string} 分类结果
 */
function classifyObservation(observation) {
    const content = observation.content || '';
    
    if (content.includes('error') || content.includes('错误')) {
        return 'error';
    } else if (content.includes('warning') || content.includes('警告')) {
        return 'warning';
    } else {
        return 'info';
    }
}

/**
 * 关联历史记忆
 * @param {Object} observation - 观察数据对象
 * @param {string} category - 分类结果
 * @returns {Promise<Array>} 关联的记忆ID数组
 */
async function findRelatedMemories(observation, category) {
    try {
        const query = {
            timeRange: {
                start: new Date(observation.timestamp - 24 * 60 * 60 * 1000), // 24小时内
                end: new Date(observation.timestamp + 60 * 1000) // 1分钟容错
            },
            type: category,
            keywords: extractKeywords(observation.content)
        };
        
        const relatedMemories = await memoryStore.search(query);
        return relatedMemories.map(memory => memory.id);
    } catch (error) {
        logger.error('Failed to search related memories:', error);
        return [];
    }
}

/**
 * 从内容中提取关键词
 * @param {string} content - 观察内容
 * @returns {Array} 关键词数组
 */
function extractKeywords(content) {
    if (!content) return [];
    
    // 简单关键词提取：去除标点符号，分割单词，取前5个
    const words = content
        .replace(/[.,!?;:'"()-]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 5);
    
    return [...new Set(words)];
}

/**
 * 生成分析结果摘要
 * @param {Object} observation - 观察数据对象
 * @param {string} category - 分类结果
 * @param {Array} relatedMemoryIds - 关联的记忆ID数组
 * @returns {string} 摘要文本
 */
function generateSummary(observation, category, relatedMemoryIds) {
    const relatedInfo = relatedMemoryIds.length > 0 
        ? `关联${relatedMemoryIds.length}条历史记忆` 
        : '无相关历史记忆';
    
    return `[${category.toUpperCase()}] ${observation.content.substring(0, 100)}... ${relatedInfo}`;
}

/**
 * 主分析函数：处理观察数据积压
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeObservations() {
    const { observations_unanalyzed } = systemState.getState();
    
    if (observations_unanalyzed < 1) {
        logger.info('No unanalyzed observations found, skipping analysis');
        return { status: 'skipped', processed: 0 };
    }
    
    logger.info(`Starting analysis of ${observations_unanalyzed} unanalyzed observations`);
    
    try {
        // 获取未分析的观察数据
        const unanalyzedObservations = await observationDataSource.getUnanalyzedObservations();
        
        if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
            logger.warn('No observation data found for analysis');
            systemState.updateState({ observations_unanalyzed: 0 });
            return { status: 'completed', processed: 0 };
        }
        
        const processedCount = unanalyzedObservations.length;
        const analysisResults = [];
        
        // 处理每个观察数据
        for (const observation of unanalyzedObservations) {
            try {
                // 分类观察类型
                const category = classifyObservation(observation);
                
                // 关联历史记忆
                const relatedMemoryIds = await findRelatedMemories(observation, category);
                
                // 生成分析结果摘要
                const summary = generateSummary(observation, category, relatedMemoryIds);
                
                // 存储分析结果到记忆系统
                const memoryEntry = {
                    timestamp: new Date(),
                    type: 'observation_analysis',
                    category: category,
                    observationId: observation.id || `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    summary: summary,
                    relatedMemoryIds: relatedMemoryIds,
                    content: observation.content,
                    metadata: {
                        originalTimestamp: observation.timestamp,
                        source: observation.source || 'unknown'
                    }
                };
                
                await memoryStore.add(memoryEntry);
                
                analysisResults.push({
                    observationId: memoryEntry.observationId,
                    category: category,
                    summary: summary,
                    relatedMemoryIds: relatedMemoryIds
                });
                
                logger.info(`Processed observation: ${memoryEntry.observationId}`);
            } catch (error) {
                logger.error(`Failed to process observation ${observation.id || 'unknown'}:`, error);
                // 继续处理其他观察数据，不中断整个流程
                continue;
            }
        }
        
        // 重置计数器
        systemState.updateState({ observations_unanalyzed: 0 });
        
        // 记录分析完成事件
        const completionEvent = {
            timestamp: new Date(),
            type: 'analysis_completed',
            processedCount: processedCount,
            results: analysisResults
        };
        
        await memoryStore.add(completionEvent);
        
        logger.info(`Analysis completed. Processed ${processedCount} observations.`);
        
        return {
            status: 'completed',
            processed: processedCount,
            results: analysisResults
        };
        
    } catch (error) {
        logger.error('Failed during observation analysis:', error);
        