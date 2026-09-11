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

  // 验证输入数据是否为非空有效对象
  _validateInputData(data, fieldName) {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      const error = new Error(`输入数据 ${fieldName} 为空或无效对象`);
      this.logger.error(`数据验证失败: ${error.message}`);
      throw error;
    }
    return true;
  }

  // 验证配置完整性
  _validateConfig() {
    const requiredConfigs = ['observationAnalyzer', 'codeSynthesizer'];
    for (const configKey of requiredConfigs) {
      if (!this.config[configKey] || typeof this.config[configKey] !== 'function') {
        const error = new Error(`配置 ${configKey} 未定义或不是函数`);
        this.logger.error(`配置验证失败: ${error.message}`);
        throw error;
      }
    }
  }

  // 生成兜底改进项
  _generateFallbackImprovement() {
    this.logger.warn('触发兜底机制：生成系统健康检查改进');
    
    const healthCheckImprovement = {
      ...this.config.fallbackConfig.healthCheckImprovement,
      id: `health-check-${Date.now()}`,
      timestamp: new Date().toISOString(),
      isFallback: true,
      generatedAt: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30分钟后
    };
    
    return healthCheckImprovement;
  }

  // 验证代码合成器返回结果
  _validateSynthesizerResult(result) {
    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      return false;
    }
    
    // 检查基本结构
    const requiredFields = ['name', 'description', 'type', 'changes'];
    for (const field of requiredFields) {
      if (!(field in result)) {
        return false;
      }
    }
    
    return true;
  }

  async generateImprovements(currentCode, analysisReport, context = {}) {
    const startTime = Date.now();
    this.logger.info(`开始生成改进 | 函数: generateImprovements | 输入数据大小: code=${JSON.stringify(currentCode).length}, report=${JSON.stringify(analysisReport).length}`);
    
    try {
      // 验证输入数据
      this._validateInputData(currentCode, 'currentCode');
      this._validateInputData(analysisReport, 'analysisReport');
      
      // 验证配置
      this._validateConfig();
      
      this.logger.info('输入数据和配置验证通过，开始生成改进');

      let improvements = [];