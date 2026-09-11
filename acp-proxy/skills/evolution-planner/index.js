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
  },
  // 新增：生成策略配置
  generationStrategy: {
    explorationRate: 0.7, // 探索率：0-1之间，越高越倾向于探索新方案
    mutationStrength: 0.3, // 变异强度：0-1之间，控制变异幅度
    diversityThreshold: 0.4, // 多样性阈值：0-1之间，低于此值会增加多样性
    qualityThreshold: 0.6, // 质量阈值：0-1之间，候选改进的最低质量要求
    adaptiveEnabled: true, // 是否启用自适应调整
    maxConsecutiveFailures: 3, // 最大连续失败次数后触发自适应调整
    presetStrategies: [
      { name: '随机探索', weight: 0.2, explorationRate: 0.9 },
      { name: '历史模式模仿', weight: 0.3, explorationRate: 0.3 },
      { name: '系统优化', weight: 0.5, explorationRate: 0.5 }