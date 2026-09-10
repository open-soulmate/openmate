/**
 * 自主执行引擎插件 (Autonomous Executor Plugin)
 * 
 * 旨在降低对'partner'的绝对依赖，培养agent的自编程和自修复能力。
 * 提供标准化、安全的沙箱环境，让agent能够自主执行低风险、模式化的代码修改任务。
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// 插件日志存储
const executionLogs = [];

// 低风险模式化任务关键词配置
const LOW_RISK_KEYWORDS = {
  action: ['修改', '更新', '替换', '添加一个', '删除一个', '增加一个', '减少一个'],
  target: ['配置文件', '常量', '字符串', '日志', '注释', '变量名', '函数名', '标记', '标签', '值'],
  scope: ['单个', '一个', '某一个', '特定', '局部', '简单']
};

// 高风险/复杂任务关键词
const HIGH_RISK_KEYWORDS = [
  '架构', '重构', '重写', '迁移', '数据库', '表结构', '索引',
  '算法', '优化', '性能', '并发', '异步', '回调', '中间件',
  '认证', '授权', '安全', '加密', '解密', '网络', '协议',
  '集成', '第三方', 'API接口', '微服务', '分布式', '集群'
];

// 文件扩展名与验证方法映射
const VALIDATORS = {
  '.json': 'json',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.yaml': 'yaml',
  '.yml': 'yaml'
};

/**
 * 简单任务评估器
 * 根据description和requirements中的关键词判断任务复杂度
 */
function assessTaskComplexity(description, requirements = []) {
  const textToAnalyze = `${description} ${requirements.join(' ')}`.toLowerCase();
  
  // 计算低风险关键词匹配数
  let lowRiskScore = 0;
  let matchedLowRiskKeywords = [];
  
  // 检查动作关键词
  for (const keyword of LOW_RISK_KEYWORDS.action) {
    if (textToAnalyze.includes(keyword.toLowerCase())) {
      lowRiskScore += 2;
      matchedLowRiskKeywords.push(keyword);
    }
  }
  
  // 检查目标关键词
  for (const keyword of LOW_RISK_KEYWORDS.target) {
    if (textToAnalyze.includes(keyword.toLowerCase())) {
      lowRiskScore += 2;
      matchedLowRiskKeywords.push(keyword);
    }
  }
  
  // 检查范围关键词
  for (const keyword of LOW_RISK_KEYWORDS.scope) {
    if (textToAnalyze.includes(keyword.toLowerCase())) {
      lowRiskScore += 1;
      matchedLowRiskKeywords.push(keyword);
    }
  }
  
  // 计算高风险关键词匹配数
  let highRiskScore = 0;
  let matchedHighRiskKeywords = [];
  
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (textToAnalyze.includes(keyword.toLowerCase())) {
      highRiskScore += 3;
      matchedHighRiskKeywords.push(keyword);
    }
  }
  
  // 决策逻辑
  const isLowRisk = lowRiskScore >= 3 && highRiskScore === 0;
  const isHighRisk = highRiskScore >= 3;
  
  return {
    isLowRisk,
    isHighRisk,
    complexity: isHighRisk ? 'complex' : (isLowRisk ? 'simple' : 'moderate'),
    lowRiskScore,
    highRiskScore,
    matchedLowRiskKeywords,
    matchedHighRiskKeywords,
    recommendation: isHighRisk ? 'requires_partner_execution' : 
                    (isLowRisk ? 'autonomous_execution' : 'requires_review')
  };
}

/**
 * 生成代码修改建议（diff格式）
 * 基于任务描述和要求，智能生成修改建议
 */
function generateCodeModification(description, requirements = []) {
  const modificationPlan = {
    type: 'unknown',
    targetFile: null,
    changes: [],
    diff: ''
  };
  
  const text = `${description} ${requirements.join(' ')}`.toLowerCase();
  
  // 检测修改类型
  if (text.includes('配置文件') || text.includes('配置')) {
    modificationPlan.type = 'config_update';
    modificationPlan.targetFile = detectConfigFile(text);
  } else if (text.includes('日志') || text.includes('日志输出')) {
    modificationPlan.type = 'log_addition';
    modificationPlan.targetFile = detectSourceFile(text);
  } else if (text.includes('常量') || text.includes('字符串')) {
    modificationPlan.type = 'constant_update';
    modificationPlan.targetFile = detectSourceFile(text);
  } else if (text.includes('注释')) {
    modificationPlan.type = 'comment_update';
    modificationPlan.targetFile = detectSourceFile(text);
  }
  
  // 生成diff
  modificationPlan.diff = generateDiff(modificationPlan, description, requirements);
  
  return modificationPlan;
}

/**
 * 检测配置文件类型
 */
function detectConfigFile(text) {
  if (text.includes('json')) return 'config.json';
  if (text.includes('yaml') || text.includes('yml')) return 'config.yaml';
  if (text.includes('env') || text.includes('环境')) return '.env';
  return 'config.json'; // 默认
}

/**
 * 检测源代码文件类型
 */
function detectSourceFile(text) {
  if (text.includes('javascript') || text.includes('js')) return 'src/index.js';
  if (text.includes('typescript') || text.includes('ts')) return 'src/index.ts';
  if (text.includes('python') || text.includes('py')) return 'src/main.py';
  return 'src/index.js'; // 默认
}

/**
 * 生成diff格式的代码变更
 */
function generateDiff(modificationPlan, description, requirements) {
  const timestamp = new Date().toISOString();
  let diff = `--- a/${modificationPlan.targetFile || 'unknown'}\n`;
  diff += `+++ b/${modificationPlan.targetFile || 'unknown'}\n`;
  diff += `@@ -1,5 +1,10 @@\n`;
  diff += ` # Auto-generated modification\n`;
  diff += ` # Task: ${description}\n`;
  diff += ` # Generated at: ${timestamp}\n`;
  diff += ` # Type: ${modificationPlan.type}\n`;
  diff += `+\n`;
  
  // 根据任务类型生成具体变更
  switch (modificationPlan.type) {
    case 'config_update':
      diff += `+// Configuration updated based on requirements\n`;
      diff += `+// ${requirements.join('\n+// ')}\n`;
      break;
    case 'log_addition':
      diff += `+console.log('[${timestamp}] ${description}');\n`;
      break;
    case 'constant_update':
      diff += `+// Constant updated: ${description}\n`;
      break;
    case 'comment_update':
      diff += `+// ${description}\n`;
      break;
    default:
      diff += `+// Modification: ${description}\n`;
  }
  
  return diff;
}

/**
 * 沙箱执行环境
 * 使用Node.js vm模块创建安全的执行环境
 */
class Sandbox {
  constructor() {
    this.context = vm.createContext({
      console: {
        log: (...args) => this.captureOutput('log', args),
        error: (...args) => this.captureOutput('error', args),
        warn: (...args) => this.captureOutput('warn', args)
      },
      JSON: JSON,
      Date: Date,
      Math: Math,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,