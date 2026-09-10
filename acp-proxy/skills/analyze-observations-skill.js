// acp-proxy/skills/analyze-observations-skill.js

const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 计算观察记录的类型分布统计
 * @param {Array} observations - 观察记录数组
 * @param {number} limit - 考虑的记录数量上限（默认50）
 * @returns {Object} 类型分布统计
 */
function computeTypeDistribution(observations, limit = 50) {
    const distribution = {};
    const recent = observations.slice(0, limit);
    
    for (const obs of recent) {
        const type = obs.type || 'unknown';
        distribution[type] = (distribution[type] || 0) + 1;
    }
    
    return {
        total: recent.length,
        types: distribution,
        generatedAt: new Date().toISOString()
    };
}

/**
 * 分析单条观察记录，生成结构化分析
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
function analyzeSingleObservation(observation) {
    const content = observation.content || '';
    const timestamp = observation.timestamp || new Date().toISOString();
    
    // 模式识别和语义理解（简化版本，实际可集成NLP服务）
    const patterns = [];
    const suggestedActions = [];
    
    // 基于关键词的模式识别
    if (content.includes('error') || content.includes('失败')) {
        patterns.push('错误模式');
        suggestedActions.push('增加错误处理逻辑');
    }
    if (content.includes('slow') || content.includes('性能')) {
        patterns.push('性能瓶颈');
        suggestedActions.push('优化性能关键路径');
    }
    if (content.includes('用户') || content.includes('反馈')) {
        patterns.push('用户相关');
        suggestedActions.push('改进用户体验');
    }
    
    // 关联进化目标
    const evolutionTargets = [];
    if (patterns.includes('错误模式')) {
        evolutionTargets.push('错误自修复');
    }
    if (patterns.includes('性能瓶颈')) {
        evolutionTargets.push('性能优化');
    }
    if (patterns.includes('用户相关')) {
        evolutionTargets.push('用户满意度提升');
    }
    
    // 如果没有识别到特定模式，提供通用分析
    if (patterns.length === 0) {
        patterns.push('待深入分析');
        suggestedActions.push('收集更多上下文信息');
    }
    
    return {
        observationId: observation.id,
        identifiedPatterns: patterns,
        evolutionTargets,
        suggestedActions,
        confidenceScore: patterns.includes('待深入分析') ? 0.3 : 0.8,
        analysisTimestamp: timestamp
    };
}

/**
 * 生成综合分析报告
 * @param {Array} observations - 观察记录数组
 * @param {Array} analysisResults - 分析结果数组
 * @returns {Object} 综合分析报告
 */
function generateAnalysisReport(observations, analysisResults) {
    const typeDistribution = computeTypeDistribution(observations);
    
    // 统计分析结果
    const patternCounts = {};
    const targetCounts = {};
    const actionCounts = {};
    
    for (const result of analysisResults) {
        for (const pattern of result.identifiedPatterns) {
            patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
        }
        for (const target of result.evolutionTargets) {
            targetCounts[target] = (targetCounts[target] || 0) + 1;
        }
        for (const action of result.suggestedActions) {
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        }
    }
    
    // 确定优先级（按出现频率排序）
    const topPatterns = Object.entries(patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([pattern, count]) => ({ pattern, count }));
    
    const topTargets = Object.entries(targetCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([target, count]) => ({ target, count }));
    
    return {
        reportType: 'analysis_report',
        generatedAt: new Date().toISOString(),
        summary: `已分析 ${analysisResults.length} 条观察记录，识别出 ${Object.keys(patternCounts).length} 种模式`,
        typeDistribution,
        topPatterns,
        topTargets,
        actionableRecommendations: Object.entries(actionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([action, count]) => ({ action, priority: count })),
        detailedResults: analysisResults,
        statistics: {
            totalObservations: observations.length,
            analyzedCount: analysisResults.length,
            averageConfidence: analysisResults.reduce((sum, r) => sum + r.confidenceScore, 0) / analysisResults.length
        }
    };
}

/**
 * 核心技能：分析观察记录并生成结构化报告
 * @returns {Promise<Object>} 操作结果
 */
async function analyzeObservationsSkill() {
    const result = {
        success: false,
        analyzedCount: 0,
        failedCount: 0,
        reportId: null,
        errors: [],
        timestamp: new Date().toISOString()
    };
    
    try {
        // 1. 获取未分析的观察记录
        const observations = await memoryPlugin.get_observations({
            status: 'unanalyzed'
        });
        
        if (!Array.isArray(observations) || observations.length === 0) {
            result.success = true;
            result.message = '没有需要分析的观察记录';
            return result;
        }
        
        const analysisResults = [];
        
        // 2. 逐条分析观察记录
        for (const observation of observations) {
            try {
                const analysis = analyzeSingleObservation(observation);
                analysisResults.push(analysis);
                
                // 3. 更新观察记录状态为已分析
                await memoryPlugin.update_observation_status({
                    id: observation.id,
                    status: 'analyzed',
                    metadata: {
                        analysisSummary: analysis.identifiedPatterns.join(', '),
                        analyzedAt: new Date().toISOString(),
                        confidenceScore: analysis.confidenceScore
                    }
                });
                
                result.analyzedCount++;
            } catch (error) {
                result.failedCount++;
                result.errors.push({
                    observationId: observation.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });