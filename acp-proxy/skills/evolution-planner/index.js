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

// ... 其他代码保持不变 ...

// 新增：输入数据验证函数 (修改后)
function validateInputData(inputData) {
  const logger = console; // 可以从配置中获取，这里先使用默认值
  
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
  
  const missingFields = [];
  
  if (!inputData || typeof inputData !== 'object') {
    logger.error('[validateInputData] 输入数据无效: 必须为对象', { inputData });
    return { valid: false, message: '输入数据无效: 必须为对象', missingFields: [] };
  }
  
  for (const field of requiredFields) {
    if (!inputData[field]) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    const errorMessage = `输入数据无效：缺少必要字段 [${missingFields.join(', ')}]`;
    logger.error(errorMessage, { inputData });
    return { valid: false, message: errorMessage, missingFields };
  }
  
  // 可以添加更详细的验证逻辑
  return { valid: true, message: '验证通过', missingFields: [] };
}

// 新增：从历史成功改进中选取并微调
async function getHistoricalSuccessImprovement(config) {
  const logger = config.logger || console;
  
  try {
    // 读取历史改进记录
    const historyPath = config.knowledgeBasePath || DEFAULT_CONFIG.knowledgeBasePath;
    let historicalData = [];
    
    try {
      const historyData = await fs.readFile(historyPath, 'utf8');
      historicalData = JSON.parse(historyData).filter(item => 
        item.status === 'success' && item.improvement
      );
    } catch (readError) {
      logger.error(`[getHistoricalSuccessImprovement] 读取历史记录失败: ${readError.message}`, { path: historyPath, error: readError });
      return null;
    }
    
    if (historicalData.length === 0) {
      logger.warn('[getHistoricalSuccessImprovement] 没有找到历史成功改进记录，将返回兜底方案');
      
      // 返回兜底方案
      return config.fallbackConfig?.healthCheckImprovement || DEFAULT_CONFIG.fallbackConfig.healthCheckImprovement;
    }
    
    // 取最近的成功改进记录
    const recentSuccess = historicalData.slice(0, config.fallbackConfig?.historicalSuccessLimit || DEFAULT_CONFIG.fallbackConfig.historicalSuccessLimit);
    
    // 随机选择一个进行微调
    const selected = recentSuccess[Math.floor(Math.random() * recentSuccess.length)];
    
    // 微调参数
    const adjustmentRange = config.fallbackConfig?.parameterAdjustmentRange || DEFAULT_CONFIG.fallbackConfig.parameterAdjustmentRange;
    const adjustedImprovement = { ...selected.improvement };
    
    // 对数值参数进行微调
    if (adjustedImprovement.estimatedTime) {
      const timeValue = parseFloat(adjustedImprovement.estimatedTime);
      if (!isNaN(timeValue)) {
        const adjustment = 1 + (Math.random() * (adjustmentRange.max - adjustmentRange.min) + adjustmentRange.min) * (Math.random() > 0.5 ? 1 : -1);
        adjustedImprovement.estimatedTime = `${Math.round(timeValue * adjustment)}分钟`;
      }
    }
    
    logger.info('[getHistoricalSuccessImprovement] 从历史记录中选择改进方案进行微调', { 
      originalId: selected.id,
      adjustedName: adjustedImprovement.name 
    });
    
    return adjustedImprovement;
  } catch (error) {
    logger.error(`[getHistoricalSuccessImprovement] 获取历史成功改进失败: ${error.message}`, { error });
    return null;
  }
}

// 新增：创建数据摘要函数
function createDataSummary(data) {
  if (!data || typeof data !== 'object') {
    return '数据为空或无效';
  }
  
  try {
    const summary = {};
    const keys = Object.keys(data);
    
    for (const key of keys) {
      const value = data[key];
      if (value === null || value === undefined) {
        summary[key] = 'null/undefined';
      } else if (Array.isArray(value)) {
        summary[key] = `Array(${value.length})`;
      } else if (typeof value === 'object') {
        summary[key] = `Object(${Object.keys(value).length}个属性)`;
      } else {