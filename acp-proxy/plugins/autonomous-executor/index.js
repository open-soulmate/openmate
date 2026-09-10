'use strict';

const vm = require('vm');
const path = require('path');

// 模拟日志记录器
class PluginLogger {
  constructor() {
    this.logs = [];
  }

  log(taskDescription, status, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      task_description: taskDescription,
      status,
      details
    };
    this.logs.push(logEntry);
    console.log(`[Autonomous Executor] ${timestamp} - ${taskDescription} - ${status}: ${details}`);
    return logEntry;
  }

  getLogs() {
    return this.logs;
  }
}

// 简单任务评估器
function evaluateTask(proposal) {
  const keywords = ['修改', '更新', '添加一个', '配置文件', '常量', '日志'];
  const text = `${proposal.description} ${proposal.requirements}`.toLowerCase();
  let matchCount = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  // 根据关键词匹配数量判断复杂度，超过2个匹配为低风险
  return matchCount >= 2 ? 'simple' : 'complex';
}

// 生成代码修改建议（diff格式）
function generateDiff(proposal) {
  // 基于描述和要求模拟生成diff，这里简化为文本diff
  let diff = `--- Original Code\n+++ Modified Code\n`;
  diff += `@@ Example Diff Based on Proposal @@\n`;

  // 根据关键词生成示例修改
  if (proposal.description.includes('配置文件')) {
    diff += `- oldConfigValue = "default"\n+ newConfigValue = "updated"\n`;
  } else if (proposal.description.includes('日志')) {
    diff += `- // No logging\n+ console.log("Added log entry: ", process.env.NODE_ENV);\n`;
  } else if (proposal.description.includes('常量')) {
    diff += `- const CONSTANT = "oldValue";\n+ const CONSTANT = "newValue";\n`;
  } else {
    diff += `- // Generic placeholder\n+ // Modified based on proposal\n`;
  }

  return diff;
}

// 沙箱环境执行修改
function executeInSandbox(diff) {
  // 模拟文件系统，使用vm模块创建沙箱上下文
  const sandbox = {
    fileSystem: {
      'config.json': '{"key": "value"}',
      'script.js': 'console.log("Original script");'
    },
    console: console,
    result: null
  };

  const context = vm.createContext(sandbox);

  try {
    // 解析diff并应用修改到模拟文件系统
    const lines = diff.split('\n');
    let targetFile = null;
    const changes = [];

    for (const line of lines) {
      if (line.startsWith('+')) {
        changes.push(line.substring(1).trim());
      } else if (line.startsWith('-')) {
        // 记录要删除的内容
      } else if (line.includes('.json') || line.includes('.js')) {
        targetFile = line.match(/(\w+\.\w+)/)?.[0];
      }
    }

    if (targetFile && sandbox.fileSystem[targetFile]) {
      // 应用第一个修改作为示例
      if (changes.length > 0) {
        const originalContent = sandbox.fileSystem[targetFile];
        // 简单替换模拟
        sandbox.fileSystem[targetFile] = changes[0];
        sandbox.result = { success: true, modifiedFile: targetFile };
      }
    } else {
      sandbox.result = { success: false, error: 'Target file not found in sandbox' };
    }
  } catch (error) {
    sandbox.result = { success: false, error: error.message };
  }

  return sandbox.result;
}

// 验证修改
function validateChanges(modificationResult) {
  if (!modificationResult.success) {
    return { valid: false, error: modificationResult.error };
  }

  try {
    // 模拟基础验证
    const simulatedContent = modificationResult.modifiedContent || '{}';

    // JSON语法检查
    if (modificationResult.modifiedFile?.endsWith('.json')) {
      JSON.parse(simulatedContent);
    }

    // JavaScript语法检查（简化模拟）
    if (modificationResult.modifiedFile?.endsWith('.js')) {
      // 使用vm检查语法
      new vm.Script(simulatedContent);
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation failed: ${error.message}` };
  }
}

// 主插件函数
module.exports = function autonomousExecutor(proposal) {
  const logger = new PluginLogger();

  // 验证输入
  if (!proposal || !proposal.description || !proposal.requirements) {
    const error = 'Invalid proposal: missing description or requirements';
    logger.log(proposal?.description || 'Unknown task', 'autonomous_fail', error);
    return { status: 'autonomous_fail', details: error, logs: logger.getLogs() };
  }

  // 评估任务复杂度
  const complexity = evaluateTask(proposal);
  const taskDescription = proposal.description;

  if (complexity === 'complex') {
    // 复杂任务，标记为需要partner介入
    const details = 'Task complexity evaluation: complex. Requires partner execution.';
    logger.log(taskDescription, 'deferred_to_partner', details);
    return {
      status: 'deferred_to_partner',
      recommendation: 'requires_partner_execution',
      details,
      logs: logger.getLogs()
    };
  }

  // 可自主执行的任务
  try {
    // 生成修改建议