const fs = require('fs');
const path = require('path');

/**
 * memory_search - 记忆搜索微型MCP工具
 * 
 * 作为'工具创造'目标的第一个最低可行里程碑，
 * 增强系统的知识积累能力，优化记忆检索效率。
 */

// 记忆数据文件路径
const MEMORY_DATA_PATH = path.join(__dirname, '..', 'data', 'memories.json');

/**
 * 加载记忆数据
 * @returns {Array} 记忆条目数组
 */
function loadMemories() {
  try {
    if (!fs.existsSync(MEMORY_DATA_PATH)) {
      return [];
    }
    const data = fs.readFileSync(MEMORY_DATA_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[memory_search] 加载记忆数据失败:', error.message);
    return [];
  }
}

/**
 * 计算记忆条目与查询的相关性分数
 * @param {Object} memory - 记忆条目
 * @param {string} query - 搜索查询
 * @returns {number} 相关性分数 (0-1)
 */
function calculateRelevance(memory, query) {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
  let score = 0;
  let matchCount = 0;

  // 搜索 content 字段
  const content = (memory.content || '').toLowerCase();
  for (const term of queryTerms) {
    if (content.includes(term)) {
      score += 3; // 内容匹配权重最高
      matchCount++;
    }
  }

  // 搜索 tags 字段
  const tags = Array.isArray(memory.tags) ? memory.tags : [];
  const tagsStr = tags.join(' ').toLowerCase();
  for (const term of queryTerms) {
    if (tagsStr.includes(term)) {
      score += 2; // 标签匹配权重中等
      matchCount++;
    }
  }

  // 搜索 title 字段（如果有）
  const title = (memory.title || '').toLowerCase();
  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 2.5; // 标题匹配权重
      matchCount++;
    }
  }

  // 搜索 id 字段
  const id = (memory.id || '').toLowerCase();
  if (id.includes(queryLower)) {
    score += 1;
    matchCount++;
  }

  // 计算匹配覆盖率（多个词都匹配会增加分数）
  const coverage = matchCount / Math.max(queryTerms.length, 1);
  score *= (0.5 + coverage * 0.5);

  // 归一化到 0-1 范围
  const maxPossibleScore = queryTerms.length * 3 * 1.5;
  return Math.min(score / Math.max(maxPossibleScore, 1), 1);
}

/**
 * 生成内容摘要
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
 * 执行记忆搜索
 * @param {Object} params - 搜索参数
 * @param {string} params.query - 搜索查询字符串
 * @param {number} [params.limit=10] - 返回结果数量限制
 * @returns {Object} 搜索结果
 */
function execute(params) {
  const { query, limit = 10 } = params;

  // 验证参数
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      success: false,
      error: '请提供有效的搜索查询字符串',
      results: [],
      total: 0
    };
  }

  // 加载记忆数据
  const memories = loadMemories();

  if (memories.length === 0) {
    return {
      success: true,
      results: [],
      total: 0,
      message: '记忆库为空，未找到任何记忆条目'
    };
  }

  // 计算每条记忆的相关性分数
  const scoredMemories = memories
    .map(memory => ({
      ...memory,
      _relevance: calculateRelevance(memory, query.trim())
    }))
    .filter(memory => memory._relevance > 0) // 过滤掉完全不相关的
    .sort((a, b) => b._relevance - a._relevance) // 按相关性降序排序
    .slice(0, Math.max(1, Math.min(limit, 100))); // 限制返回数量

  // 格式化返回结果
  const results = scoredMemories.map(memory => ({
    id: memory.id,
    content: generateSummary(memory.content),
    created_at: memory.created_at,
    tags: memory.tags || [],
    relevance_score: Math.round(memory._relevance * 100) / 100
  }));

  return {
    success: true,
    results: results,
    total: results.length,
    query: query.trim(),
    message: `找到 ${results.length} 条相关记忆`
  };
}

// 导出 MCP 工具接口
module.exports = {
  name: 'memory_search',
  
  description: '在系统记忆库中进行关键词匹配搜索，支持搜索记忆的内容(content)、标签(tags)、标题(title)等字段。返回按相关性排序的记忆条目列表。适用于知识检索、历史信息查找、上下文回忆等场景。是系统知识积累和技能支撑的核心基础工具。',
  
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询字符串，支持多个关键词（空格分隔），将在记忆的内容、标签等字段中进行匹配'
      },
      limit: {
        type: 'number',
        description: '返回结果的数量限制，默认为10，最大不超过100',
        minimum: 1,
        maximum: 100,
        default: 10
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  
  execute: execute
};