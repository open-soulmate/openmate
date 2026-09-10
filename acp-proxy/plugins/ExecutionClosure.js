'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 执行闭环插件
 * 实现'尝试-记录-学习'的基本循环，支持'错误自修复'和'知识积累'
 */

// 默认配置
const DEFAULT_CONFIG = {
  logFilePath: path.join(process.cwd(), 'memory', 'executions.jsonl'),
  errorKeywords: ['error', 'Error', 'ERROR', 'failed', 'FAILED', 'invalid', 'null', 'undefined', 'NaN']
};

let config = { ...DEFAULT_CONFIG };

/**
 * 快速评估函数
 * 检查输出是否包含错误关键词或为空
 */
function quickAssess(output) {
  const issues = [];
  
  // 检查输出是否为空
  if (output === null || output === undefined) {
    issues.push('Output is null or undefined');
  } else if (typeof output === 'string' && output.trim() === '') {
    issues.push('Output is empty string');
  }
  
  // 检查错误关键词
  if (typeof output === 'string') {
    for (const keyword of config.errorKeywords) {
      if (output.includes(keyword)) {
        issues.push(`Output contains error keyword: ${keyword}`);
      }
    }
  }
  
  return {
    hasIssues: issues.length > 0,
    issues,
    timestamp: new Date().toISOString()
  };
}

/**
 * 确保日志目录存在
 */
function ensureLogDirectory() {
  const logDir = path.dirname(config.logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * 记录执行结果到JSONL文件
 */
function appendExecutionRecord(record) {
  ensureLogDirectory();
  
  const jsonRecord = JSON.stringify({
    timestamp: record.timestamp,
    skillName: record.skillName,
    input: record.input,
    output: record.output,
    duration: record.duration,
    success: record.success,
    error: record.error,
    assessment: record.assessment
  }) + '\n';
  
  fs.appendFileSync(config.logFilePath, jsonRecord, 'utf8');
}

/**
 * 高阶函数：包装技能执行函数
 * @param {Function} skillExecuteFn - 原始技能执行函数
 * @returns {Function} 包装后的执行函数
 */