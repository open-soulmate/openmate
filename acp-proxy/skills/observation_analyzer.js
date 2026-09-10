// acp-proxy/skills/observation_analyzer.js

// 假设系统模块导入
const systemState = require('../system/state');
const observationDataSource = require('../data/observations');
const memoryStore = require('../memory/store');
const logger = require('../utils/logger');

// 预定义分类规则
const classificationRules = {
    error: ['error', 'failed', 'exception'],
    warning: ['warning', 'warn', 'alert'],
    info: ['info', 'information', 'log']
};

// 分类函数
function classifyObservation(content) {
    const lowerContent = content.toLowerCase();
    for (const [type, keywords] of Object.entries(classificationRules)) {
        for (const keyword of keywords) {
            if (lowerContent.includes(keyword)) {
                return type;
            }
        }
    }
    return 'unknown';
}

// 关联记忆查询函数
async function queryRelatedMemories(type, timestamp, keywords) {
    try {
        const query = {
            type: type,
            timestamp: timestamp,
            keywords: keywords
        };
        const memories = await memoryStore.search(query);
        return memories || [];
    } catch (error) {
        logger.error('Error querying related memories:', error);
        return [];
    }
}

// 主分析函数
async function analyzeObservations() {
    try {
        // 检查观察数据积压
        if (systemState.observations_unanalyzed >= 1) {