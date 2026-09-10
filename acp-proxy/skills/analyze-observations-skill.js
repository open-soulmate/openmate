// analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin.js');

/**
 * analyze-observations-skill
 * 核心技能：分析未处理的观察记录，生成结构化分析结论和行动建议
 * 用于打破进化循环停滞，建立"观察-分析-行动"闭环
 */

// 配置常量
const CONFIG = {
    STATUS_UNANALYZED: 'unanalyzed',
    STATUS_ANALYZED: 'analyzed',
    MEMORY_TYPE_OBSERVATION: 'observation',
    MEMORY_TYPE_ANALYSIS_REPORT: 'analysis_report',
    MAX_BATCH_SIZE: 50,
    ANALYSIS_PROMPTS: {
        patternRecognition: [
            '错误', '失败', '异常', '性能', '瓶颈', '优化', '重复', '低效', '缺失', '矛盾'
        ],
        evolutionGoals: [
            '错误自修复', '性能优化', '工具创造', '知识积累', '流程改进', '决策优化'
        ],
        improvementActions: [
            '修改配置', '优化逻辑', '创建工具', '添加验证', '更新规则', '扩展功能'
        ]
    }
};

/**
 * 简单统计分析工具：计算最近N条观察的类型分布
 * 这是技能内嵌的第一个微小工具创造实例
 */
function analyzeTypeDistribution(observations, n = 20) {
    const recentObservations = observations.slice(0, n);
    const distribution = {};
    
    recentObservations.forEach(obs => {
        const type = obs.metadata?.type || 'unknown';
        distribution[type] = (distribution[type] || 0) + 1;
    });
    
    return {
        totalAnalyzed: recentObservations.length,
        distribution,
        topTypes: Object.entries(distribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([type, count]) => ({ type, count }))
    };
}

/**
 * 模式识别：从观察内容中提取关键模式
 */
function extractPatterns(content) {
    const patterns = [];
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    
    CONFIG.ANALYSIS_PROMPTS.patternRecognition.forEach(pattern => {
        if (text.includes(pattern)) {
            patterns.push(pattern);
        }
    });
    
    return [...new Set(patterns)]; // 去重
}

/**
 * 关联进化目标：基于识别出的模式推荐相关的进化目标
 */
function mapToEvolutionGoals(patterns) {
    const goalMapping = {
        '错误': '错误自修复',
        '失败': '错误自修复',
        '异常': '错误自修复',
        '性能': '性能优化',
        '瓶颈': '性能优化',
        '优化': '性能优化',
        '重复': '流程改进',
        '低效': '流程改进',
        '缺失': '工具创造',
        '矛盾': '知识积累'
    };
    
    const relatedGoals = new Set();
    patterns.forEach(pattern => {
        if (goalMapping[pattern]) {
            relatedGoals.add(goalMapping[pattern]);
        }
    });
    
    return [...relatedGoals];
}

/**
 * 生成改进建议：基于模式和目标生成具体建议
 */
function generateImprovementSuggestions(patterns, goals) {
    const suggestions = [];
    
    // 基于模式的建议
    if (patterns.includes('错误') || patterns.includes('失败')) {
        suggestions.push('添加错误重试机制和降级处理');
    }
    
    if (patterns.includes('性能')) {
        suggestions.push('优化关键路径性能，考虑缓存策略');
    }
    
    if (patterns.includes('重复')) {
        suggestions.push('提取重复逻辑为可复用函数或工具');
    }
    
    // 基于目标的建议
    goals.forEach(goal => {
        if (goal === '工具创造') {
            suggestions.push('识别可自动化流程并创建专用工具');
        }
        if (goal === '知识积累') {
            suggestions.push('将隐性知识显性化并存入记忆库');
        }
    });
    
    return [...new Set(suggestions)];
}

/**
 * 分析单条观察记录
 */
async function analyzeSingleObservation(observation) {
    try {
        // 提取内容，兼容不同格式
        const content = observation.content || observation.data || observation;
        const contentText = typeof content === 'string' ? content : JSON.stringify(content);
        
        // 模式识别
        const patterns = extractPatterns(contentText);
        
        // 关联进化目标
        const evolutionGoals = mapToEvolutionGoals(patterns);
        
        // 生成改进建议
        const improvements = generateImprovementSuggestions(patterns, evolutionGoals);
        
        // 生成摘要
        const summary = {
            patternsIdentified: patterns,
            relatedGoals: evolutionGoals,
            suggestedImprovements: improvements,
            analysisTimestamp: new Date().toISOString(),
            confidence: patterns.length > 0 ? 'high' : 'medium'
        };
        
        return {
            success: true,
            analysis: summary,
            summaryText: `识别到${patterns.length}个模式，关联${evolutionGoals.length}个进化目标，建议${improvements.length}项改进`
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            analysis: null,
            summaryText: `分析失败: ${error.message}`
        };
    }
}

/**
 * 生成分析报告
 */
function generateAnalysisReport(analysisResults) {
    const successful = analysisResults.filter(r => r.success);
    const failed = analysisResults.filter(r => !r.success);
    
    // 统计模式分布
    const patternDistribution = {};
    successful.forEach(result => {
        result.analysis.patternsIdentified.forEach(pattern => {
            patternDistribution[pattern] = (patternDistribution[pattern] || 0) + 1;
        });
    });
    
    // 统计目标关联
    const goalDistribution = {};