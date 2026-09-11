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
      accuracy: 0.85,
      reliability: 0.9,
      efficiency: 0.8
    },
    testStandards: {
      testCoverage: 0.8,
      passRate: 0.9
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
    
    this.logger = this.config.logger || console;
  }

  // 验证输入数据是否为非空有效对象或数组
  _validateInputData(data, fieldName) {
    this.logger.debug(`开始验证输入数据: ${fieldName}。数据类型: ${typeof data}`);
    
    // 处理null/undefined
    if (data === null || data === undefined) {
      const error = new Error(`输入数据 ${fieldName} 为null或undefined`);
      this.logger.error(`数据验证失败: ${error.message}`);
      throw error;
    }

    // 验证对象（排除数组和null）
    if (typeof data === 'object' && !Array.isArray(data)) {
      if (Object.keys(data).length === 0) {
        const error = new Error(`输入数据 ${fieldName} 为空对象`);
        this.logger.error(`数据验证失败: ${error.message}`);
        throw error;
      }
      this.logger.debug(`输入数据 ${fieldName} 验证通过: 非空对象，包含 ${Object.keys(data).length} 个键`);
      return true;
    }

    // 验证数组
    if (Array.isArray(data)) {
      if (data.length === 0) {
        const error = new Error(`输入数据 ${fieldName} 为空数组`);
        this.logger.error(`数据验证失败: ${error.message}`);
        throw error;
      }
      this.logger.debug(`输入数据 ${fieldName} 验证通过: 非空数组，长度 ${data.length}`);
      return true;
    }

    // 其他类型（字符串、数字、布尔值等）
    const error = new Error(`输入数据 ${fieldName} 类型无效: ${typeof data}`);
    this.logger.error(`数据验证失败: ${error.message}`);
    throw error;
  }

  // 验证配置完整性
  _validateConfig() {
    this.logger.debug('开始验证配置完整性');
    
    // 验证必需的函数配置
    const requiredConfigs = ['observationAnalyzer', 'codeSynthesizer'];
    for (const configKey of requiredConfigs) {
      if (!this.config[configKey] || typeof this.config[configKey] !== 'function') {
        const error = new Error(`配置 ${configKey} 未定义或不是函数`);
        this.logger.error(`配置验证失败: ${error.message}`);
        throw error;
      }
      this.logger.debug(`配置 ${configKey} 验证通过: 已定义且为函数`);
    }
    
    // 验证evaluationCriteria结构完整性
    this.logger.debug('开始验证evaluationCriteria配置结构');
    if (!this.config.evaluationCriteria || typeof this.config.evaluationCriteria !== 'object') {
      const error = new Error('evaluationCriteria配置缺失或不是对象');
      this.logger.error(`配置验证失败: ${error.message}`);
      throw error;
    }
    
    const requiredCriteria = ['qualityThresholds', 'testStandards'];
    for (const criteria of requiredCriteria) {
      if (!this.config.evaluationCriteria[criteria] || typeof this.config.evaluationCriteria[criteria] !== 'object') {
        const error = new Error(`evaluationCriteria.${criteria} 缺失或不是对象`);
        this.logger.error(`配置验证失败: ${error.message}`);
        throw error;
      }
    }
    this.logger.debug('evaluationCriteria配置结构验证通过');
    
    // 验证fallbackConfig结构完整性
    this.logger.debug('开始验证fallbackConfig配置结构');
    if (!this.config.fallbackConfig || typeof this.config.fallbackConfig !== 'object') {
      const error = new Error('fallbackConfig配置缺失或不是对象');
      this.logger.error(`配置验证失败: ${error.message}`);
      throw error;
    }
    
    const requiredFallback = ['healthCheckImprovement', 'historicalSuccessLimit', 'parameterAdjustmentRange'];
    for (const fallback of requiredFallback) {
      if (!(fallback in this.config.fallbackConfig)) {
        const error = new Error(`fallbackConfig.${fallback} 缺失`);
        this.logger.error(`配置验证失败: ${error.message}`);
        throw error;
      }
    }
    
    // 验证health