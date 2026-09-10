const vm = require('vm');
const fs = require('fs');
const path = require('path');

// 简单任务评估关键词
const LOW_RISK_KEYWORDS = [
    '修改', '更新', '添加一个', '配置文件', '常量', '日志',
    '修改配置文件', '更新一个字符串常量', '添加一个日志输出',
    'add a', 'update a', 'modify', 'config', 'constant', 'log'
];

// 主函数：自主执行引擎
function autonomousExecutor(improvementProposal) {
    const { description = '', requirements = '' } = improvementProposal;
    const taskDescription = description || requirements;
    const timestamp = new Date().toISOString();

    // 1. 评估任务复杂度
    const evaluationResult = evaluateTaskComplexity(description, requirements);

    // 初始化执行日志条目
    const logEntry = {
        timestamp,
        task_description: taskDescription.substring(0, 100), // 防止日志过长
        status: '',
        details: {}
    };

    // 2. 根据评估结果处理任务
    if (evaluationResult.isLowRisk) {
        // 尝试自主执行
        try {
            const autonomousResult = executeAutonomously(improvementProposal);
            logEntry.status = autonomousResult.success ? 'autonomous_success' : 'autonomous_fail';
            logEntry.details = autonomousResult;
        } catch (error) {
            logEntry.status = 'autonomous_fail';
            logEntry.details = {
                error: error.message,
                suggestion: '自主执行过程中发生异常，建议转交partner处理。'
            };
        }
    } else {
        // 标记为需要partner执行
        logEntry.status = 'deferred_to_partner';
        logEntry.details = {
            reason: evaluationResult.reason,
            suggestion: '该任务复杂度较高，涉及架构或非模式化变更，需要partner介入执行。'
        };
    }

    // 3. 记录日志（模拟日志存储）
    appendToLog(logEntry);

    // 4. 返回处理结果
    return {
        proposal: improvementProposal,
        evaluation: evaluationResult,
        execution: logEntry.status === 'deferred_to_partner' ? null : logEntry.details,
        status: logEntry.status,
        requires_partner_execution: logEntry.status === 'deferred_to_partner',
        report: generateReport(logEntry)
    };
}

// 任务复杂度评估器
function evaluateTaskComplexity(description, requirements) {
    const combinedText = `${description} ${requirements}`.toLowerCase();

    // 检查是否包含低风险关键词
    const matchedKeywords = LOW_RISK_KEYWORDS.filter(keyword =>
        combinedText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
        return {
            isLowRisk: true,
            reason: `识别为低风险模式化任务，匹配关键词: ${matchedKeywords.join(', ')}`,
            complexity: 'low',
            canAutonomous: true
        };
    }

    // 复杂任务判断规则
    const complexPatterns = [
        /架构/, /重构/, /数据库/, /部署/, /迁移/, /安全/, /算法/,
        /architecture/, /refactor/, /database/, /deploy/, /migration/, /security/, /algorithm/
    ];

    const isComplex = complexPatterns.some(pattern => pattern.test(combinedText));

    return {
        isLowRisk: false,
        reason: isComplex ? '任务涉及架构、数据库、安等方面，复杂度较高' : '未识别出低风险模式化特征，视为复杂任务',
        complexity: 'high',
        canAutonomous: false
    };
}

// 自主执行逻辑
function executeAutonomously(proposal) {
    const { description, requirements } = proposal;

    // 1. 生成代码修改建议（diff格式）
    const codeModification = generateCodeModification(description, requirements);

    // 2. 在沙箱环境中应用修改
    const sandboxResult = applyInSandbox(codeModification);

    // 3. 验证修改
    const validationResult = validateModification(sandboxResult, codeModification);

    return {
        success: validationResult.valid,
        modification_plan: codeModification,
        sandbox_execution: sandboxResult,
        validation: validationResult,
        generated_code: codeModification.newCode
    };
}

// 生成代码修改建议（模拟）
function generateCodeModification(description, requirements) {
    // 根据描述和需求生成模拟的代码修改
    // 这里返回一个模拟的diff结构
    const modificationId = `mod_${Date.now()}`;

    // 模拟不同类型的修改
    let newCode = '';
    let targetFile = 'config/default.json';
    let modificationType = 'string_update';

    if (description.includes('配置文件') || description.includes('config')) {
        newCode = JSON.stringify({
            setting: 'updated_value',
            timestamp: new Date().toISOString()
        }, null, 2);
        targetFile = 'config/app.json';
        modificationType = 'config_update';
    } else if (description.includes('常量') || description.includes('constant')) {
        newCode = `// Updated constant\nconst UPDATED_VALUE = 'new_value';\nmodule.exports = { UPDATED_VALUE };`;
        targetFile = 'constants.js';
        modificationType = 'constant_update';
    } else if (description.includes('日志') || description.includes('log')) {
        newCode = `console.log('[${
            new Date().toISOString()
        }] Updated log output: ${
            description.substring(0, 50)
        }');`;
        targetFile = 'utils/logger.js';
        modificationType = 'log_addition';
    } else {
        // 默认修改
        newCode = `// Modified based on: ${description}\n// Requirements: ${requirements}`;
        targetFile = 'auto_modified.js';
        modificationType = 'general_update';
    }

    return {
        id: modificationId,
        type: modificationType,
        description: `自主生成的修改: ${description.substring(0, 80)}`,
        target_file: targetFile,
        old_code: '(原始代码 - 已模拟替换)',
        new_code: newCode,
        diff: generateMockDiff(targetFile, modificationType),
        risk_level: 'low',
        estimated_impact: 'minimal'
    };
}

// 生成模拟diff
function generateMockDiff(filename, modificationType) {