// acp-proxy/skills/self_debug_and_repair.js

const Skill = require('../models/Skill');
const SkillRegistry = require('../services/SkillRegistry');
const Logger = require('../utils/Logger');
const RepairKnowledgeBase = require('../services/RepairKnowledgeBase');

class SelfDebugAndRepair extends Skill {
  constructor() {
    super({
      name: 'self_debug_and_repair',
      description: '自我调试与修复技能，自动检测和修复技能调用中的常见错误',
      version: '1.0.0',
      category: 'system',
      inputSchema: {
        type: 'object',
        properties: {
          skillName: {
            type: 'string',
            description: '要调用的技能名称'
          },
          args: {
            type: 'object',
            description: '技能调用参数'
          },
          repairContext: {
            type: 'object',
            description: '修复上下文信息，包含额外的修复线索',
            properties: {
              errorHints: {
                type: 'object',
                description: '错误提示信息'
              },
              documentations: {
                type: 'object',
                description: '技能相关文档'
              }
            }
          }
        },
        required: ['skillName', 'args']
      }
    });
    
    this.repairKnowledgeBase = new RepairKnowledgeBase();
    this.maxRetries = 3;
    this.retryableErrors = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'RATE_LIMIT']);
  }

  /**
   * 包装对其他技能的调用，实现自动错误检测与修复
   */
  async callWithRepair(skillName, args, repairContext = {}) {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    Logger.info(`[${callId}] 开始技能调用: ${skillName}`, { args });
    
    let attempt = 0;
    let lastError = null;
    
    // 首次调用尝试
    try {
      attempt++;
      const result = await this._executeSkill(skillName, args);
      
      Logger.info(`[${callId}] 技能调用成功`, { result });
      return {
        success: true,
        result,
        attempts: attempt,
        repairs: []
      };
      
    } catch (error) {
      lastError = error;
      Logger.warn(`[${callId}] 技能调用失败，尝试诊断与修复`, {
        error: error.message,
        code: error.code
      });
      
      // 分析错误模式
      const errorAnalysis = this._analyzeError(error, skillName, args);
      
      if (!errorAnalysis.repairable) {
        Logger.warn(`[${callId}] 错误不可修复`, { errorAnalysis });
        return this._generateErrorReport(error, skillName, args, errorAnalysis);
      }
      
      // 尝试修复
      const repairResult = await this._attemptRepair(
        skillName, 
        args, 
        errorAnalysis, 
        repairContext,
        callId
      );
      
      if (repairResult.repaired) {
        // 修复成功，记录到知识库
        this._recordRepairKnowledge(skillName, errorAnalysis, repairResult, callId);
        
        return {
          success: true,
          result: repairResult.result,
          attempts: attempt,
          repairs: [{
            errorType: errorAnalysis.errorType,
            repairStrategy: repairResult.strategy,
            applied: true
          }]
        };
      } else {
        // 修复失败，返回错误报告
        return this._generateErrorReport(
          repairResult.error || error,
          skillName,
          args,
          errorAnalysis,
          repairResult.strategy
        );
      }
    }
  }

  /**
   * 分析错误模式，判断是否可修复
   */
  _analyzeError(error, skillName, args) {
    const errorMessage = error.message || error.toString();
    const errorCode = error.code || '';
    
    // 参数错误模式
    const paramErrorPatterns = [
      { pattern: /missing required parameter/i, type: 'MISSING_PARAMETER' },
      { pattern: /invalid parameter type/i, type: 'INVALID_PARAMETER_TYPE' },
      { pattern: /parameter validation failed/i, type: 'PARAMETER_VALIDATION' },