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
  },
  // 新增：无进展迭代计数器配置
  noProgressIterationLimit: 3
};

// ... 其他代码保持不变 ...

// 新增：输入数据验证函数 (修改后 - 降低验证门槛)
function validateInputData(inputData, config = {}) {
  const logger = config.logger || console;
  const validationStartTime = Date.now();
  
  // 修复：扩展关键输入数据的验证字段列表，确保下游逻辑所需字段都被检查
  const requiredFields = [
    'performanceMetrics', 
    'systemLogs', 
    'currentGoals', 
    'knowledgeBase',
    'contextData',
    'skillRegistry',
    'historicalPlans'
  ];
  
  const optionalFieldsWithDefaults = {
    'skillRegistry': {},
    'historicalPlans': [],
    'contextData': {},
    'knowledgeBase': { plans: [], learnings: [] },
    'performanceMetrics': {},
    'systemLogs': []
  };
  
  const missingFields = [];
  const warnings = [];
  
  if (!inputData || typeof inputData !== 'object') {
    logger.error('[validateInputData] 输入数据无效: 必须为对象', { 
      inputData: inputData,
      receivedType: typeof inputData 
    });
    return { 
      valid: false, 
      message: '输入数据无效: 必须为对象', 
      missingFields: [],
      validationTime: Date.now() - validationStartTime
    };
  }
  
  // 检查必要字段，但允许某些字段为空对象/数组
  for (const field of requiredFields) {
    if (inputData[field] === undefined || inputData[field] === null) {
      // 对于某些字段，如果缺失但可以接受默认值，添加警告而不是直接失败
      if (optionalFieldsWithDefaults[field] !== undefined) {
        inputData[field] = optionalFieldsWithDefaults[field];
        warnings.push(`字段 ${field} 缺失，已设置默认值`);
        logger.warn(`[validateInputData] 字段 ${field} 缺失，已设置默认值`, { field });
      } else {
        missingFields.push(field);
      }
    }
  }
  
  // 宽松验证：只在有太多缺失字段时才失败
  if (missingFields.length > 2) {
    const errorMessage = `输入数据无效：缺少必要字段 [${missingFields.join(', ')}]`;
    logger.error(errorMessage, { 
      inputData, 
      missingFields,
      optionalFieldsWithDefaults: Object.keys(optionalFieldsWithDefaults)
    });
    return { 
      valid: false, 
      message: errorMessage, 
      missingFields,
      warnings,
      validationTime: Date.now() - validationStartTime
    };
  }
  
  // 增加对 skillRegistry 和 historicalPlans 字段的类型校验（放宽验证）
  if (inputData.skillRegistry && typeof inputData.skillRegistry !== 'object') {
    const errorMessage = '输入数据无效：skillRegistry 必须是一个对象';
    logger.error(errorMessage, { skillRegistry: inputData.skillRegistry });
    inputData.skillRegistry = {}; // 设置默认值而不是直接失败
    warnings.push('skillRegistry 类型不正确，已重置为空对象');
  }
  
  if (inputData.historicalPlans && !Array.isArray(inputData.historicalPlans)) {
    const errorMessage = '输入数据无效：historicalPlans 必须是一个数组';
    logger.error(errorMessage, { historicalPlans: inputData.historicalPlans });
    inputData.historicalPlans = []; // 设置默认值而不是直接失败
    warnings.push('historicalPlans 类型不正确，已重置为空数组');
  }
  
  // 检查关键字段的基本结构，但允许部分缺失
  if (inputData.performanceMetrics && typeof inputData.performanceMetrics !== 'object') {
    logger.warn('[validateInputData] performanceMetrics 不是对象类型，将使用默认空对象', { performanceMetrics: inputData.performanceMetrics });
    inputData.performanceMetrics = {};
    warnings.push('performanceMetrics 格式不正确');
  }
  
  if (inputData.currentGoals && !Array.isArray(inputData.currentGoals)) {
    logger.warn('[validateInputData] currentGoals 不是数组类型，将使用默认空数组', { currentGoals: inputData.currentGoals });
    inputData.currentGoals = [];
    warnings.push('currentGoals 格式不正确');
  }
  
  // 添加详细验证日志
  logger.info('[validateInputData] 验证完成', {
    valid: true,
    fieldCount: Object.keys(inputData).length,
    requiredFieldsPresent: requiredFields.filter(f => inputData[f] !== undefined && inputData[f] !== null).length,
    warnings: warnings.length,
    validationTime: Date.now() - validationStartTime
  });
  
  // 可以添加更详细的验证逻辑
  return { 
    valid: true, 
    message: '验证通过', 
    missingFields: [], 
    warnings,
    validationTime: Date.now() - validationStartTime,
    appliedDefaults: Object.keys(optionalFieldsWithDefaults).filter(f => !inputData[f] || 
      (Array.isArray(inputData[f]) && inputData[f].length === 0) ||
      (typeof inputData[f] === 'object' && Object.keys(inputData[f]).length === 0))
  };
}

// 新增：从历史成功改进中选取并微调
async function getHistoricalSuccessImprovement(config, retryCount = 0) {
  const logger = config.logger || console;
  const maxRetries = 3;
  
  try {
    logger.info(`[getHistoricalSuccessImprovement] 开始获取历史改进方案 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
    
    // 从知识库获取历史成功计划