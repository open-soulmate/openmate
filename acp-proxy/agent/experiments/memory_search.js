/**
 * memory_search - 记忆检索 MCP 工具
 * 
 * 实现关键词匹配搜索功能，用于在系统记忆库中检索相关信息。
 * 作为工具创造目标的第一个最低可行里程碑(MVP)，增强系统的知识积累能力。
 */

const fs = require('fs');
const path = require('path');

// 记忆数据文件路径
const MEMORIES_FILE_PATH = path.join(__dirname, '..', 'data', 'memories.json');

/**
 * 加载记忆数据
 * @returns {Array} 记忆条目数组
 */
function loadMemories() {
  try {
    if (fs.existsSync(MEMORIES_FILE_PATH)) {
      const data = fs.readFileSync(MEMORIES_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error(`[memory_search] 加载记忆数据失败: ${error.message}`);
  }
  return [];
}

/**
 * 计算记忆条目与查询关键词的相关性分数
 * @param {Object} memory - 记忆条目
 * @param {Array} keywords - 关键词数组
 * @returns {number} 相关性分数
 */
function calculateRelevance(memory, keywords) {
  let score = 0;
  const content = (memory.content || '').toLowerCase();
  const tags = Array.isArray(memory.tags) 
    ? memory.tags.map(tag => String(tag).toLowerCase()) 
    : [];
  
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    
    // 精确标签匹配（权重最高）
    if (tags.includes(lowerKeyword)) {
      score += 30;
    }
    
    // 标签部分匹配
    for (const tag of tags) {
      if (tag.includes(lowerKeyword) || lowerKeyword.includes(tag)) {
        score += 15;
      }
    }
    
    // 内容完整关键词匹配
    if (content.includes(lowerKeyword)) {
      score += 10;
      
      // 关键词在内容开头出现，增加权重
      if (content.startsWith(lowerKeyword)) {
        score += 5;
      }
      
      // 统计关键词出现次数作为额外权重
      const occurrences = (content.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      score += Math.min(occurrences - 1, 5) * 2; // 额外出现次数，上限5次
    }
  }
  
  return score;
}

/**
 * 生成内容摘要（截取前200字符）
 * @param {string} content - 完整内容
 * @param {number} maxLength - 最大长度
 * @returns {string} 内容摘要
 */
function generateSummary(content, maxLength = 200) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

/**
 * MCP 工具定义
 */
const memorySearchTool = {
  /**
   * 工具名称
   */
  name: 'memory_search',

  /**
   * 工具描述 - 用于其他技能或智能体理解工具用途
   */
  description: '在系统记忆库中进行关键词匹配搜索，用于检索历史知识、对话记录和积累的信息。支持对记忆内容、标签、创建时间等字段的模糊匹配搜索。适用于需要回顾历史信息、查找相关记忆、辅助分析决策等场景。返回按相关性排序的记忆条目列表。',

  /**
   * 工具参数定义
   */
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询字符串，支持多个关键词（空格分隔）。将对记忆的content、tags等字段进行匹配搜索。'
      },
      limit: {
        type: 'number',
        description: '返回结果的最大数量限制，默认为10，最大不超过100。',
        default: 10,
        minimum: 1,
        maximum: 100
      },
      tags_filter: {
        type: 'array',
        items: { type: 'string' },
        description: '可选的标签过滤器，仅返回包含指定标签的记忆条目。'
      }
    },
    required: ['query']
  },

  /**
   * 执行搜索功能
   * @param {Object} params - 工具参数
   * @param {string} params.query - 搜索查询字符串
   * @param {number} [params.limit=10] - 返回结果数量限制
   * @param {Array} [params.tags_filter] - 标签过滤器
   * @returns {Object} 搜索结果对象
   */
  async execute(params) {
    const { query, limit = 10, tags_filter } = params;
    
    // 参数验证
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        success: false,
        error: '搜索查询不能为空',
        results: [],
        total: 0
      };
    }
    
    // 限制返回数量
    const resultLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    
    try {
      // 加载记忆数据
      const memories = loadMemories();
      
      if (memories.length === 0) {
        return {
          success: true,
          results: [],
          total: 0,