// acp-proxy/skills/analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 简单的统计分析工具 - 计算最近N条观察的类型分布
 * @param {Array} observations - 观察记录数组
 * @param {number} n - 取最近N条，默认20
 * @returns {Object} 类型分布统计
 */
function computeTypeDistribution(observations, n = 20) {
    const recent = observations.slice(0, n);
    const distribution = {};
    
    recent.forEach(obs => {
        const type = obs.type || 'unknown';
        distribution[type] = (distribution[type] || 0) + 1;
    });
    
    return {
        total: recent.length,
        distribution,
        topTypes: Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => ({ type, count, percentage: (count / recent.length * 100).toFixed(1) + '%' }))
    };
}

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录
 * @returns {Object} 分析结果
 */
function analyzeSingleObservation(observation) {
    const content = observation.content || '';
    const type = observation.type || 'unknown';
    const timestamp = observation.timestamp || new Date().toISOString();
    
    // 简单的模式识别逻辑
    const patterns = {
        error: /(错误|失败|异常|crash|error|fail|bug)/i,
        performance: /(性能|慢|卡顿|延迟|performance|slow|latency)/i,
        behavior: /(行为|模式|习惯|pattern|behavior)/i,
        improvement: /(优化|改进|提升|improve|enhance)/i,
        security: /(安全|漏洞|风险|security|vulnerability|risk)/i
    };
    
    const identifiedProblems = [];
    const relatedGoals = [];
    const suggestedImprovements = [];
    
    // 识别问题/模式
    Object.entries(patterns).forEach(([key, regex]) => {
        if (regex.test(content)) {
            identifiedProblems.push({
                pattern: key,
                confidence: 'medium',
                evidence: content.substring(0, 100)
            });
        }
    });
    
    // 关联进化目标
    if (patterns.error.test(content)) {
        relatedGoals.push({
            goal: '错误自修复',
            relevance: 'high',
            description: '该观察涉及错误或失败，直接关联到系统自我修复能力的提升'
        });
        suggestedImprovements.push({
            type: 'configuration',
            suggestion: '更新错误监控配置，添加该类错误的自动检测规则',
            priority: 'high'
        });
    }
    
    if (patterns.performance.test(content)) {
        relatedGoals.push({
            goal: '性能优化',
            relevance: 'medium',
            description: '该观察涉及性能问题，关联到系统效率提升'
        });
        suggestedImprovements.push({
            type: 'logic',
            suggestion: '优化相关代码路径，减少不必要的计算',
            priority: 'medium'
        });
    }
    
    // 默认建议
    if (suggestedImprovements.length === 0) {
        suggestedImprovements.push({
            type: 'tool',
            suggestion: '基于此观察创建新的分析工具或监控脚本',
            priority: 'low'
        });
    }
    
    return {
        observationId: observation.id,
        analyzedAt: new Date().toISOString(),
        identifiedProblems,
        relatedGoals,
        suggestedImprovements,