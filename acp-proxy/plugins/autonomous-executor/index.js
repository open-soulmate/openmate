const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Plugin metadata
const pluginMeta = {
  name: 'autonomous-executor',
  version: '1.0.0',
  description: '自主执行引擎插件，降低对partner的依赖，培养agent的自编程和自修复能力'
};

// Simple task evaluation keywords
const EVALUATION_KEYWORDS = {
  lowRisk: [
    '修改', '更新', '添加一个', '配置文件', '常量', '日志', 
    '调整', '替换', '更正', '优化一个', '一个字符串', 
    '一个变量', '一个方法', '一个函数', '简单', '模式化'
  ],
  highRisk: [
    '架构变更', '重构', '大规模', '复杂', '重写', 
    '重大修改', '依赖变更', '数据库', '接口变更', '核心'
  ]
};

// Default sandbox context for code execution
const DEFAULT_SANDBOX_CONTEXT = {
  console: console,
  JSON: JSON,
  Math: Math,
  Date: Date,
  // Add other safe globals as needed
};

/**
 * Simple task evaluator - determines if a task is low-risk patternable
 * @param {string} description - Task description
 * @param {string|object} requirements - Task requirements
 * @returns {boolean} - Whether the task is considered low-risk
 */
function evaluateTaskComplexity(description, requirements) {
  const requirementsText = typeof requirements === 'object' 
    ? JSON.stringify(requirements) 
    : (requirements || '');
  
  const combinedText = `${description} ${requirementsText}`.toLowerCase();
  
  // Check for high-risk keywords first
  for (const keyword of EVALUATION_KEYWORDS.highRisk) {
    if (combinedText.includes(keyword.toLowerCase())) {
      return false; // High risk
    }
  }
  
  // Check for low-risk keywords
  for (const keyword of EVALUATION_KEYWORDS.lowRisk) {
    if (combinedText.toLowerCase().includes(keyword.toLowerCase())) {
      return true; // Low risk
    }
  }
  
  // Default to high risk if no clear indicators
  return false;
}

/**
 * Generate code modification suggestions in diff format
 * @param {string} description - Task description
 * @param {string|object} requirements - Task requirements
 * @returns {string} - Diff format code suggestions
 */
function generateCodeDiff(description, requirements) {
  const requirementsText = typeof requirements === 'object' 
    ? JSON.stringify(requirements, null, 2) 
    : (requirements || 'No specific requirements provided');
  
  // Simple diff generation based on description
  const timestamp = new Date().toISOString();
  const diff = `
--- Original
+++ Modified
@@ -1,5 +1,10 @@
+// Auto-generated modification by Autonomous Executor
+// Description: ${description}
+// Timestamp: ${timestamp}
+// Requirements: ${requirementsText.substring(0, 200)}${requirementsText.length > 200 ? '...' : ''}
+
+// Proposed changes: