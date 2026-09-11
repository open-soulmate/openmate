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
  
  const requiredFields = ['performanceMetrics', 'systemLogs'];
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
      // 返回配置中的兜底方案
      const fallbackImprovement = config.fallbackConfig?.healthCheckImprovement || DEFAULT_CONFIG.fallbackConfig.healthCheckImprovement;
      return {
        ...fallbackImprovement,
        isFallback: true,
        reason: '无历史成功改进记录'
      };
    }
    
    // 选取最近的一个成功改进
    const recentSuccess = historicalData[historicalData.length - 1].improvement;
    
    // 参数微调：随机调整一些参数
    const adjustmentRange = config.fallbackConfig?.parameterAdjustmentRange || 
                           DEFAULT_CONFIG.fallbackConfig.parameterAdjustmentRange;
    const adjustmentFactor = adjustmentRange.min + 
      Math.random() * (adjustmentRange.max - adjustmentRange.min);
    
    // 创建微调后的改进提案
    const adjustedImprovement = {
      ...recentSuccess,
      name: `${recentSuccess.name} (微调版)`,
      // ... 其他微调逻辑保持不变 ...
    };
    
    logger.info(`[getHistoricalSuccessImprovement] 从历史记录中选取并微调了改进方案: ${adjustedImprovement.name}`);
    return adjustedImprovement;
  } catch (error) {
    logger.error(`[getHistoricalSuccessImprovement] 获取历史改进方案时发生未知错误: ${error.message}`, { error });
    // 返回兜底方案
    const fallbackImprovement = config.fallbackConfig?.healthCheckImprovement || DEFAULT_CONFIG.fallbackConfig.healthCheckImprovement;
    return {
      ...fallbackImprovement,
      isFallback: true,
      reason: '获取历史方案时发生错误'
    };
  }
}

// 新增：代码改进评估函数 (修改后)
async function evaluateCodeImprovement(improvementProposal, config) {
  const logger = config.logger || console;
  
  logger.info('[evaluateCodeImprovement] 开始评估代码改进提案', { proposalName: improvementProposal?.name });
  
  // 1. 输入验证
  const validationResult = validateInputData(improvementProposal);
  if (!validationResult.valid) {
    logger.error(`[evaluateCodeImprovement] 输入验证失败: ${validationResult.message}`, { proposal: improvementProposal });
    // 返回失败状态，而非抛出异常
    return {
      success: false,
      status: 'input_validation_failed',
      message: validationResult.message,
      missingFields: validationResult.missingFields,
      details: { proposal: improvementProposal }
    };
  }
  
  // 2. 执行评估逻辑 (原有逻辑的简化占位)
  try {
    // ... 原有评估逻辑 ...
    
    // 假设评估逻辑可能因为没有有效改进方案而需要特殊处理
    const hasValidImprovements = true; // 替换为实际评估结果
    
    if (!hasValidImprovements) {
      logger.warn('[evaluateCodeImpro