const fs = require('fs');
const path = require('path');

const MEMORY_FILE_PATH = path.join(__dirname, '../data/memories.json');

function loadMemories() {
  try {
    const data = fs.readFileSync(MEMORY_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading memories:', error);
    return [];
  }
}

function parseKeywords(query) {
  return query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0);
}

function calculateRelevance(memory, keywords) {
  let score = 0;
  const contentLower = memory.content?.toLowerCase() || '';
  const tagsLower = (memory.tags || []).map(tag => tag.toLowerCase()).join(' ');
  const createdAt = memory.created_at?.toLowerCase() || '';

  keywords.forEach(keyword => {
    if (contentLower.includes(keyword)) {
      score += 3;
    }
    if (tagsLower.includes(keyword)) {
      score += 2;
    }
    if (createdAt.includes(keyword)) {
      score += 1;
    }
  });

  return score;
}

function searchMemories(query, limit = 10) {
  const memories = loadMemories();
  const keywords = parseKeywords(query);
  
  if (keywords.length === 0) {
    return memories.slice(0, limit);
  }

  const scoredMemories = memories.map(memory => ({
    ...memory,
    relevance: calculateRelevance(memory, keywords)
  }));

  return scoredMemories
    .filter(memory => memory.relevance > 0)
    .sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    })
    .slice(0, limit)
    .map(memory => ({
      id: memory.id,
      content: memory.content?.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content,
      created_at: memory.created_at
    }));
}

const memory_search = {
  name: 'memory_search',
  description: '在系统的记忆库中进行关键词匹配搜索，用于检索历史记忆、知识点和积累的经验。支持同时匹配记忆内容、标签和创建时间，按相关性排序返回结果。适用于需要查找特定信息、回忆历史记录或构建知识图谱的场景。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询字符串，将被拆分为关键词进行匹配搜索'
      },
      limit: {
        type: 'number',
        description: '返回结果的最大数量，默认为10',
        default: 10
      }
    },
    required: ['query']
  },
  execute: async function(params) {
    try {
      const { query, limit = 10 } = params;
      const results = searchMemories(query, limit);
      
      return {
        success: true,
        data: {
          results,
          total_matches: results.length,
          query: query
        },
        message: `找到 ${results.length} 条相关记忆`
      };
    } catch (error) {
      return {
        success: false,
        error: '记忆搜索失败: ' + error.message,
        data: {
          results: [],
          total_matches: 0,
          query: params.query
        }
      };
    }
  }
};

module.exports = memory_search;