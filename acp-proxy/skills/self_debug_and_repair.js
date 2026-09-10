const { callWithRepair } = require('../utils/repair');

/**
 * 自我调试与修复技能
 * 作为错误自修复目标的首个最小闭环实现
 */
module.exports = async function self_debug_and_repair(context, args) {
    const { skillName, targetArgs, repairContext = {} } = args;
    
    try {
        // 调用目标技能并进行修复包装
        const result = await callWithRepair(skillName, targetArgs, {
            ...repairContext,
            debugMode: true
        });
        
        // 检查是否有修复记录
        const repairLog = getRepairLog(skillName);
        
        return {
            success: true,
            result,
            repairPerformed: result.repairPerformed || false,
            repairLog,
            message: '技能调用完成，如需修复则已自动处理'
        };
    } catch (error) {
        // 无法自动修复的错误，生成结构化错误报告
        const errorReport = await generateErrorReport(skillName, targetArgs, error);
        
        return {
            success: false,
            error: error.message,
            errorReport,
            repairSuggestion: errorReport.repairSuggestion || '需要人工介入或重新设计技能',
            message: `技能调用失败: ${error.message}`
        };
    }
};

/**
 * 生成修复知识库的键名
 */
function getRepairKey(skillName, errorPattern) {
    return `repair:${skillName}:${errorPattern}`;
}

/**
 * 获取修复日志
 */
function getRepairLog(skillName) {
    try {
        const logs = [];
        const storage = context.storage || {};
        
        // 从存储中获取该技能的修复记录
        if (storage.repairLog && storage.repairLog[skillName]) {
            logs.push(...storage.repairLog[skillName]);
        }
        
        return logs.slice(-10); // 返回最近的10条记录
    } catch (e) {
        return [];
    }
}

/**
 * 记录修复成功案例
 */
async function recordRepairSuccess(skillName, errorPattern, fixStrategy, successResult) {
    try {
        const storage = context.storage || {};
        
        if (!storage.repairLog) storage.repairLog = {};
        if (!storage.repairLog[skillName]) storage.repairLog[skillName] = [];
        
        const record = {
            timestamp: new Date().toISOString(),
            errorPattern,
            fixStrategy,
            successResult: successResult ? '成功' : '失败',
            context: {
                args: targetArgs,
                repairContext
            }
        };
        
        storage.repairLog[skillName].push(record);
        
        // 保持日志不超过100条
        if (storage.repairLog[skillName].length > 100) {
            storage.repairLog[skillName] = storage.repairLog[skillName].slice(-100);
        }
        
        console.log(`[修复知识库] 记录成功: ${skillName} - ${errorPattern}`);
    } catch (e) {
        console.warn('记录修复成功案例失败:', e.message);
    }
}

/**
 * 生成结构化错误报告
 */