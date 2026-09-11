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

// 新增：输入数据验证函数
function validateInputData(inputData) {
  const logger = console; // 可以从配置中获取，这里先使用默认值
  
  const requiredFields = ['performanceMetrics', 'systemLogs'];
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!inputData || !inputData[field]) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    const errorMessage = `输入数据无效：缺少必要字段 [${missingFields.join(', ')}]`;
    logger.error(errorMessage, { inputData });
    throw new Error(errorMessage);
  }
  
  // 可以添加更详细的验证逻辑
  return true;
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
      logger.warn(`读取历史记录失败: ${readError.message}`);
      return null;
    }
    
    if (historicalData.length === 0) {
      logger.warn('没有找到历史成功改进');
      return null;
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
      description: `基于历史成功改进的参数微调，调整系数: ${adjustmentFactor.toFixed(2)}`,
      parameters: {
        ...recentSuccess.parameters,
        adjustmentFactor,
        lastSuccessfulDate: new Date().toISOString()
      },
      origin: 'historical_fallback'
    };
    
    logger.info('使用历史成功改进作为兜底策略');
    return adjustedImprovement;
  } catch (error) {
    logger.error(`获取历史成功改进失败: ${error.message}`);
    return null;
  }
}

// 新增：生成预设低风险改进提案
function generateLowRiskImprovement(config) {
  const logger = config.logger || console;
  
  const fallbackConfig = config