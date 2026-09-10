// acp-proxy/skills/self_debug_and_repair.js
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// 修复知识库路径
const REPAIR_KNOWLEDGE_BASE_PATH = path.join(__dirname, '../data/repair_knowledge_base.json');

// 最大重试次数
const MAX_RETRY_ATTEMPTS = 3;

// 重试间隔（毫秒）
const RETRY_DELAY = 1000;

/**
 * 错误模式分类
 */
const ErrorPatterns = {
  PARAMETER_TYPE_MISMATCH: {
    name: 'parameter_type_mismatch',
    regex: /parameter.*type.*mismatch|invalid.*parameter.*type|类型.*不匹配/i,
    description: '参数类型不匹配'
  },
  MISSING_REQUIRED_PARAMETER: {
    name: 'missing_required_parameter',
    regex: /missing.*required.*parameter|required.*parameter.*missing|缺少.*必需.*参数/i,
    description: '缺少必需参数'
  },
  RESOURCE_NOT_FOUND: {
    name: 'resource_not_found',
    regex: /resource.*not.*found|找不到.*资源|文件.*不存在/i,
    description: '资源未找到'
  },
  NETWORK_ERROR: {
    name: 'network_error',
    regex: /network.*error|连接.*失败|timeout.*exceeded|网络.*超时/i,
    description: '网络错误'
  },
  PERMISSION_DENIED: {
    name: 'permission_denied',
    regex: /permission.*denied|权限.*不足|access.*denied/i,