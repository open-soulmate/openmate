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
  }
};

// ... 其他代码保持不变 ...

// 评估进化周期结果的函数
async function evaluateCycleResults(validationResults, config) {
  const logger = config.logger || console;
  
  try {
    // 首先检查validationResults数组是否为空
    if (!validationResults || validationResults.length === 0) {
      // 无改进项的情况，返回已跳过状态
      logger.info('Evolution cycle skipped - no improvements to validate');
      return {
        success: true,
        status: 'skipped',
        failedCount: 0,
        totalCount: 0,
        message: 'No evolution improvements to validate in this cycle'
      };
    }
    
    // 统计结果
    const totalCount = validationResults.length;
    const failedCount = validationResults.filter(result => !result.success).length;
    const successCount = totalCount - failedCount;
    
    // 根据失败项数量判定成功或失败
    if (failedCount > 0) {
      // 当有失败项时标记为失败
      logger.error(`Evolution cycle failed. Successes: ${successCount}, Failures: ${failedCount}`);
      return {
        success: false,
        status: 'failed',
        failedCount,
        totalCount,
        details: validationResults
      };
    } else {
      // 当未通过验证的改进数量为0时，标记为成功
      logger.info(`Evolution cycle completed successfully. Successes: ${successCount}, Failures: ${failedCount}`);
      return {
        success: true,
        status: 'completed',
        failedCount,
        totalCount,
        details: validationResults
      };
    }
  } catch (error) {
    logger.error(`Error evaluating cycle results: ${error.message}`);
    return {
      success: false,
      status: 'error',
      failedCount: -1,
      totalCount: validationResults ? validationResults.length : 0,
      error: error.message
    };
  }
}

// ... 其他代码保持不变 ...

module.exports = {
  DEFAULT_CONFIG,
  evaluateCycleResults,
  // ... 其他导出 ...
};