'use strict';

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// 配置常量
const DEFAULT_CONFIG = {
  planningInterval: 24 * 60 * 60 * 1000, // 24小时
  confirmationTimeout: 48 * 60 * 60 * 1000, // 48小时
  maxSubGoals: 10,
  knowledgeBasePath: './knowledge/evolution-plans.json',
  plansDir: './evolution-plans',
  progressDir: './progress-reports',
  observationAnalyzer: null, // 将注入
  selfIntrospect: null, // 将注入
  skillRegistry: null, // 将注入
  reporter: null, // 新增：报告器注入点
  codeSynthesizer: null, // 新增：代码合成器注入点
  logger: console, // 新增：日志记录器注入点
  evaluationCriteria: {
    qualityThresholds: {
      accuracy: { value: 0.85, min: 0.7, max: 1.0, adjustable: true },
      reliability: { value: 0.9, min: 0.8, max: 1.0, adjustable: true },
      efficiency: { value: 0.8, min: 0.6, max: 1.0, adjustable: true }
    },
    testStandards: {
      testCoverage: { value: 0.8, min: 0.6, max: 1.0, adjustable: true },
      passRate: { value: 0.9, min: 0.8, max: 1.0, adjustable: true }
    }
  },
  // 新增：验证配置
  validationConfig: {
    maxRetryAttempts: 3,
    retryDelay: 1000,
    fallbackStrategies: {
      useDefault: true,
      strictMode: false,
      skipValidation: false
    }
  },
  // 新增：兜底配置
  fallbackConfig: {
    healthCheckImprovement: {
      name: '系统健康检查',
      description: '执行一次全面的系统健康检查',
      type: 'maintenance',
      priority: 'high',
      riskLevel: 'low',
      estimatedTime: '30分钟',
      requiredResources: ['system-monitor', 'diagnostic-tools']
    },
    historicalSuccessLimit: 5,
    parameterAdjustmentRange: {
      min: 0.1,
      max: 0.3
    }
  }
};

class EvolutionPlanner extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentPlan = null;
    this.progress = new Map();
    this.knowledgeBase = [];
    this.validationHistory = new Map();
    
    this.logger = this.config.logger || console;
  }

  // 验证输入数据是否为非空有效对象或数组
  async _validateInputData(data, fieldName, retryCount = 0) {
    const startTime = Date.now();
    const validationId = `${fieldName}_${Date.now()}`;
    
    this.logger.debug(`[验证开始] 字段: ${fieldName}, 开始时间: ${new Date(startTime).toISOString()}`);
    this.logger.debug(`[验证详情] 字段: ${fieldName}, 数据类型: ${typeof data}, 数据值: ${JSON.stringify(data, null, 2).substring(0, 200)}`);
    
    try {
      // 处理null/undefined
      if (data === null || data === undefined) {
        const error = new Error(`输入数据 ${fieldName} 为null或undefined`);
        const duration = Date.now() - startTime;
        this.logger.error(`[验证失败] 字段: ${fieldName}, 原因: ${error.message}, 耗时: ${duration}ms`);
        this._recordValidationResult(validationId, fieldName, false, duration, error.message);
        throw error;
      }

      // 验证对象（排除数组和null）
      if (typeof data === 'object' && !Array.isArray(data)) {
        if (Object.keys(data).length === 0) {
          const error = new Error(`输入数据 ${fieldName} 为空对象`);
          const duration = Date.now() - startTime;
          this.logger.error(`[验证失败] 字段: ${fieldName}, 原因: ${error.message}, 耗时: ${duration}ms, 键数: 0`);
          this._recordValidationResult(validationId, fieldName, false, duration, error.message);
          throw error;
        }
        
        // 验证evaluationCriteria的阈值配置
        if (fieldName === 'evaluationCriteria') {
          await this._validateEvaluationCriteria(data, validationId);
        }
        
        this.logger.debug(`[验证详情] 字段: ${fieldName}, 对象验证通过, 键数: ${Object.keys(data).length}, 键列表: ${Object.keys(data).join(', ')}`);
        const duration = Date.now() - startTime;
        this.logger.debug(`[验证成功] 字段: ${fieldName}, 耗时: ${duration}ms`);
        this._recordValidationResult(validationId, fieldName, true, duration);
        return true;
      }

      // 验证数组
      if (Array.isArray(data)) {
        if (data.length === 0) {
          const error = new Error(`输入数据 ${fieldName} 为空数组`);
          const duration = Date.now() - startTime;
          this.logger.error(`[验证失败] 字段: ${fieldName}, 原因: ${error.message}, 耗时: ${duration}ms, 长度: 0`);
          this._recordValidationResult(validationId, fieldName, false, duration, error.message);
          throw error;
        }
        this.logger.debug(`[验证详情] 字段: ${fieldName}, 数组验证通过, 长度: ${data.length}`);
        const duration = Date.now() - startTime;
        this.logger.debug(`[验证成功] 字段: ${fieldName}, 耗时: ${duration}ms`);
        this._recordValidationResult(validationId, fieldName, true, duration);
        return true;
      }

      // 验证其他类型
      this.logger.debug(`[验证详情] 字段: ${fieldName}, 类型验证通过: ${typeof data}`);
      const duration = Date.now() - startTime;
      this.logger.debug(`[验证成功] 字段: ${fieldName}, 耗时: ${duration}ms`);
      this._recordValidationResult(validationId, fieldName, true, duration);
      return true;

    } catch (error) {
      return this._handleValidationFailure(error, fieldName, data, retryCount, validationId, startTime);
    }
  }

  // 验证evaluationCriteria的阈值配置
  async _validateEvaluationCriteria(criteria, validationId) {
    const validateThreshold = (thresholdName, threshold) => {
      if (!threshold || typeof threshold !== 'object') {
        throw new Error(`阈值 ${thresholdName} 配置无效，应为对象`);
      }
      
      if (typeof threshold.value !== 'number') {