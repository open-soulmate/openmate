'use strict';

const fs = require('fs');
const path = require('path');

// 错误类型枚举
const ErrorTypes = {
    INVALID_ARGUMENT: 'INVALID_ARGUMENT',
    MISSING_ARGUMENT: 'MISSING_ARGUMENT',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    NETWORK_ERROR: 'NETWORK_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    UNKNOWN: 'UNKNOWN'
};

// 修复策略枚举
const RepairStrategies = {
    FIX_ARGUMENTS: 'FIX_ARGUMENTS',
    RETRY: 'RETRY',
    SKIP: 'SKIP',
    ABORT: 'ABORT'
};

class SelfDebugAndRepair {
    constructor() {
        this.repairKnowledgeBase = {};
        this.maxRetries = 3;
        this.retryDelay = 1000; // 毫秒
        this.initialized = false;
    }

    /**
     * 初始化技能，加载修复知识库
     */
    async init() {
        if (this.initialized) return;
        
        try {
            const kbPath = path.join(__dirname, 'repair_knowledge.json');
            if (fs.existsSync(kbPath)) {
                this.repairKnowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
            }
        } catch (error) {
            console.warn('Failed to load repair knowledge base:', error.message);
            this.repairKnowledgeBase = {};
        }
        
        this.initialized = true;
    }

    /**
     * 核心函数：包装对另一个技能的调用，并提供自动修复能力
     * @param {string} skillName - 目标技能名称
     * @param {Object} args - 调用参数
     * @param {Object} [repairContext] - 修复上下文，包含额外信息用于修复
     * @returns {Promise<Object>} 技能调用结果或修复报告
     */
    async callWithRepair(skillName, args, repairContext = {}) {
        await this.init();
        
        const startTime = Date.now();
        const attemptLog = [];
        let lastError = null;
        
        // 尝试修复调用
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                attemptLog.push({ attempt, status: 'trying', timestamp: Date.now() });
                
                // 获取技能参数规范（模拟）
                const skillSpec = await this.getSkillSpec(skillName);
                
                // 参数预处理和验证
                const processedArgs = await this.preprocessArgs(skillName, args, skillSpec, repairContext);
                
                // 调用目标技能（模拟）
                const result = await this.invokeSkill(skillName, processedArgs);
                
                // 记录成功案例到知识库
                if (attempt > 1 || Object.keys(repairContext).length > 0) {
                    await this.recordRepairSuccess(skillName, args, processedArgs, repairContext, attemptLog);
                }
                
                return {
                    success: true,
                    result,
                    repairApplied: attempt > 1 || Object.keys(repairContext).length > 0,
                    attempts: attempt,
                    executionTime: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                };
                
            } catch (error) {
                lastError = error;
                attemptLog[attemptLog.length - 1].status = 'failed';
                attemptLog[attemptLog.length - 1].error = error.message;
                
                // 诊断错误
                const diagnosis = await this.diagnoseError(error, skillName, args);
                
                // 应用修复策略
                const repairResult = await this.applyRepairStrategy(
                    diagnosis, 
                    skillName, 
                    args, 
                    repairContext, 
                    attempt, 
                    error
                );
                
                // 如果需要重试，等待后继续
                if (repairResult.strategy === RepairStrategies.RETRY && attempt < this.maxRetries) {
                    await this.delay(this.retryDelay * attempt);
                    continue;
                }
                
                // 如果修复策略是跳过或中止，生成错误报告
                if (repairResult.strategy === RepairStrategies.ABORT || 
                    repairResult.strategy === RepairStrategies.SKIP) {
                    break;
                }
            }
        }
        
        // 所有尝试失败，返回错误报告
        return this.generateErrorReport(skillName, args, lastError, attemptLog, startTime);
    }

    /**
     * 诊断错误类型和原因
     */
    async diagnoseError(error, skillName, args) {
        const errorMessage = error.message.toLowerCase();
        
        // 错误模式匹配
        if (errorMessage.includes('invalid argument') || 
            errorMessage.includes('type error') ||
            errorMessage.includes('parameter') && errorMessage.includes('expected')) {
            return {
                type: ErrorTypes.INVALID_ARGUMENT,
                message: error.message,
                skillName,
                args,
                repairable: true,
                suggestedStrategy: RepairStrategies.FIX_ARGUMENTS
            };
        }
        
        if (errorMessage.includes('missing argument') || 
            errorMessage.includes('required parameter') ||
            errorMessage.includes('parameter')) {
            return {
                type: ErrorTypes.MISSING_ARGUMENT,
                message: error.message,
                skillName,
                args,
                repairable: true,
                suggestedStrategy: RepairStrategies.FIX_ARGUMENTS
            };
        }
        
        if (errorMessage.includes('not found') || 
            errorMessage.includes('does not exist') ||
            errorMessage.includes('resource')) {
            return {
                type: ErrorTypes.RESOURCE_NOT_FOUND,
                message: error.message,
                skillName,
                args,
                repairable: true,
                suggestedStrategy: RepairStrategies.RETRY
            };
        }
        
        if (errorMessage.includes('network') || 
            errorMessage.includes('timeout') ||
            errorMessage.includes('connection')) {
            return {
                type: ErrorTypes.NETWORK_ERROR,
                message: error.message,
                skillName,
                args,
                repairable: true,
                suggestedStrategy: RepairStrategies.RETRY
            };
        }
        
        if (errorMessage.includes('permission') || 
            errorMessage.includes('denied') ||
            errorMessage.includes('access')) {
            return {
                type: ErrorTypes.PERMISSION_DENIED,