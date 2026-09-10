// acp-proxy/skills/self_debug_and_repair.js

const fs = require('fs');
const path = require('path');

// 配置常量
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REPAIR_KNOWLEDGE_FILE = path.join(__dirname, '../data/repair_knowledge.json');

// 修复知识库（内存缓存）
let repairKnowledge = null;

/**
 * 初始化或加载修复知识库
 */
function initKnowledgeBase() {
    if (repairKnowledge === null) {
        try {
            if (fs.existsSync(REPAIR_KNOWLEDGE_FILE)) {
                repairKnowledge = JSON.parse(fs.readFileSync(REPAIR_KNOWLEDGE_FILE, 'utf8'));
            } else {
                repairKnowledge = {};
            }
        } catch (error) {
            repairKnowledge = {};
        }
    }
    return repairKnowledge;
}

/**
 * 保存修复经验到知识库
 */
function saveRepairExperience(errorPattern, solution) {
    const knowledge = initKnowledgeBase();
    const patternKey = JSON.stringify(errorPattern);
    
    if (!knowledge[patternKey]) {
        knowledge[patternKey] = {
            occurrences: 0,
            solutions: [],
            lastOccurrence: null
        };
    }
    
    knowledge[patternKey].occurrences++;
    knowledge[patternKey].lastOccurrence = new Date().toISOString();
    
    // 添加解决方案（避免重复）
    if (!knowledge[patternKey].solutions.some(s => JSON.stringify(s) === JSON.stringify(solution))) {
        knowledge[patternKey].solutions.push(solution);
    }
    
    // 异步保存到文件（不阻塞主流程）
    try {
        const dir = path.dirname(REPAIR_KNOWLEDGE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(REPAIR_KNOWLEDGE_FILE, JSON.stringify(knowledge, null, 2));
    } catch (saveError) {
        console.warn('Failed to save repair knowledge:', saveError.message);
    }
}

/**
 * 从知识库中查找已知修复方案
 */
function findKnownRepair(errorPattern) {
    const knowledge = initKnowledgeBase();
    const patternKey = JSON.stringify(errorPattern);
    
    if (knowledge[patternKey] && knowledge[patternKey].solutions.length > 0) {
        // 返回最常用的解决方案
        return knowledge[patternKey].solutions[0];
    }
    return null;
}

/**
 * 诊断错误类型
 */
function diagnoseError(error, skillName) {
    const errorMessage = error.message || String(error);
    const errorPattern = {
        skill: skillName,
        type: 'unknown',
        message: errorMessage
    };
    
    // 参数类型错误模式
    if (errorMessage.includes('参数类型错误') || 
        errorMessage.includes('Invalid parameter type') ||
        errorMessage.includes('expected type')) {
        errorPattern.type = 'parameter_type';
        return { pattern: errorPattern, isRepairable: true };
    }
    
    // 缺少必需参数模式
    if (errorMessage.includes('缺少必需参数') || 
        errorMessage.includes('Missing required parameter') ||
        errorMessage.includes('is required')) {
        errorPattern.type = 'missing_parameter';
        return { pattern: errorPattern, isRepairable: true };
    }
    
    // 资源未找到模式
    if (errorMessage.includes('资源未找到') || 
        errorMessage.includes('Resource not found') ||
        errorMessage.includes('not found')) {
        errorPattern.type = 'resource_not_found';
        return { pattern: errorPattern, isRepairable: false };
    }
    
    // 网络相关错误模式
    if (errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection')) {
        errorPattern.type = 'network';
        return { pattern: errorPattern, isRepairable: true };
    }
    
    // 未知错误
    return { pattern: errorPattern, isRepairable: false };
}

/**
 * 参数修复策略
 */
function repairParameterError(args, repairContext, errorInfo) {
    const repairedArgs = { ...args };
    const { pattern, error } = errorInfo;
    
    if (pattern.type === 'parameter_type') {
        // 尝试类型转换
        for (const [key, value] of Object.entries(repairedArgs)) {
            if (repairContext?.typeHints?.[key]) {
                const targetType = repairContext.typeHints[key];
                if (targetType === 'number' && typeof value === 'string') {
                    const num = Number(value);
                    if (!isNaN(num)) repairedArgs[key] = num;
                } else if (targetType === 'string' && typeof value !== 'string') {
                    repairedArgs[key] = String(value);
                } else if (targetType === 'boolean' && typeof value === 'string') {
                    repairedArgs[key] = value.toLowerCase() === 'true';
                }
            }
        }
    }
    
    if (pattern.type === 'missing_parameter') {
        // 尝试从repairContext补充参数
        if (repairContext?.defaultValues) {
            for (const [key, defaultValue] of Object.entries(repairContext.defaultValues)) {
                if (repairedArgs[key] === undefined) {
                    repairedArgs[key] = defaultValue;
                }
            }
        }
        