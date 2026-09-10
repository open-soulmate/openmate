/**
 * memory_search.js
 * MCP工具插件：记忆搜索工具
 * 用于在系统记忆库中进行关键词匹配搜索，增强知识积累与检索能力
 */

const fs = require('fs').promises;
const path = require('path');

// 记忆数据文件路径
const MEMORIES_FILE_PATH = path.join(__dirname, '..', 'data', 'memories.json');

/**
 * 加载记忆数据
 * @returns {Promise<Array>} 记忆条目数组
 */
async function loadMemories() {
  try {
    const data = await fs.readFile(MEMORIES_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 文件不存在或格式错误时返回空数组
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error(`Failed to load memories: ${error.message}`);
  }
}

/**
 * 计算记忆条目与查询的相关性得分
 * @param {Object} memory - 记忆条目
 * @param {string} query - 搜索关键词
 * @returns {number} 相关性得分
 */
function calculateRelevance(memory, query) {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
  let score = 0;

  // 搜索内容字段
  if (memory.content) {
    const contentLower = memory.content.toLowerCase();
    for (const term of queryTerms) {
      // 计算关键词在内容中出现的次数
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length * 2; // 内容匹配权重较高
      }
    }
    // 完整查询匹配加分
    if (contentLower.includes(queryLower)) {
      score += 10;
    }
  }

  // 搜索标签字段
  if (memory.tags && Array.isArray(memory.tags)) {
    for (const tag of memory.tags) {
      const tagLower = tag.toLowerCase();
      for (const term of queryTerms) {
        if (tagLower.includes(term)) {
          score += 5; // 标签匹配权重
        }
      }
      if (tagLower.includes(queryLower)) {
        score += 8;
      }
    }
  }

  // 搜索标题字段（如果有）
  if (memory.title) {
    const titleLower = memory.title.toLowerCase();
    for (const term of queryTerms) {
      if (titleLower.includes(term)) {
        score += 4; // 标题匹配权重
      }
    }
  }

  // 搜索类别字段（如果有）
  if (memory.category) {
    const categoryLower = memory.category.toLowerCase();
    for (const term of queryTerms) {
      if (categoryLower.includes(term)) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * 生成内容摘要
 * @param {string} content - 完整内容
 * @param {number} maxLength - 最大长度
 * @returns {string} 摘要
 */
function generateSummary(content, maxLength = 200) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

// 工具定义
const tool = {
  name: 'memory_search',
  description: '在系统记忆库中进行关键词匹配搜索。支持搜索记忆内容、标签、标题和类别等字段，按相关性返回排序结果。适用于知识检索、历史信息查找、上下文回忆等场景，可帮助智能体快速获取相关记忆信息以支持决策和任务执行。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或查询语句，支持多个关键词用空格分隔'
      },
      limit: {
        type: 'number',
        description: '返回结果的最大数量，默认为10',
        default: 10
      },
      min_relevance: {
        type: 'number',
        description: '最小相关性得分阈值，低于此分数的结果将被过滤，默认为0',
        default: 0
      },
      include_tags: {
        type: 'boolean',
        description: '是否在结果中包含标签信息，默认为true',
        default: true
      }
    },
    required: ['query']
  },

  /**
   * 执行记忆搜索
   * @param {Object} params - 工具参数
   * @param {string} params.query - 搜索关键词
   * @param {number} [params.limit=10] - 返回结果数量限制
   * @param {number} [params.min_relevance=0] - 最小相关性阈值
   * @param {boolean} [params.include_tags=true] - 是否包含标签
   * @returns {Promise<Object>} 搜索结果
   */
  async execute(params) {
    const {
      query,
      limit = 10,
      min_relevance = 0,
      include_tags = true
    } = params;

    // 参数验证
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        success: false,
        error: '搜索查询不能为空',
        results: [],
        total_count: 0
      };
    }

    try {
      // 加载记忆数据
      const memories = await loadMemories();

      if (memories.length === 0) {
        return {
          success: true,
          results: [],
          total_count: 0,
          message: '记忆库为空，暂无可用记忆'
        };
      }

      // 计算每条记忆的相关性得分
      const scoredMemories = memories.map(memory => ({
        ...memory,
        relevance_score: calculateRelevance(memory, query.trim())
      }));

      // 过滤低相关性结果并排序
      const filteredMemories = scoredMemories
        .filter(memory => memory.relevance_score > min_relevance)
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, limit);

      // 格式化返回结果
      const results = filteredMemories.map(memory => {
        const result = {
          id: memory.id,
          content: generateSummary(memory.content),
          created_at: memory.created_at,
          relevance_score: memory.relevance_score
        };

        // 可选字段
        if (memory.title) {
          result.title = memory.title;
        }
        if (memory.category) {
          result.category = memory.category;
        }
        if (include_tags && memory.tags) {
          result.tags = memory.tags;
        }
        if (memory.source) {
          result.source = memory.source;
        }
        if (memory.updated_at) {
          result.updated_at = memory.updated_at;
        }

        return result;
      });

      return {
        success: true,
        query: query.trim(),
        results: results,
        total_count: results.length,
        total_memories_searched: memories.length
      };

    } catch (error) {
      return {
        success: false,
        error: `记忆搜索失败: ${error.message}`,
        results: [],
        total_count: 0
      };
    }
  }
};

// 导出工具
module.exports = {
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
  execute: tool.execute.bind(tool)
};