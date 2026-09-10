const fs = require('fs').promises;
const path = require('path');

// 记忆数据文件路径
const MEMORIES_FILE = path.join(__dirname, '../data/memories.json');

/**
 * 内存搜索工具
 * 用于在记忆库中进行关键词匹配搜索，增强系统知识积累能力
 */
module.exports = {
  name: 'memory_search',
  description: '在系统记忆库中进行关键词匹配搜索，支持搜索记忆内容、标签和创建时间。用于快速检索相关记忆，为其他智能体或技能提供知识支持。返回按相关性排序的记忆条目数组。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或查询字符串，用于在记忆中进行匹配'
      },
      limit: {
        type: 'integer',
        default: 10,
        minimum: 1,
        maximum: 100,
        description: '返回结果的最大数量，默认为10'
      }
    },
    required: ['query']
  },
  execute: async function(params) {
    const { query, limit = 10 } = params;
    
    try {
      // 读取记忆数据文件
      let memories = [];
      try {
        const data = await fs.readFile(MEMORIES_FILE, 'utf8');
        memories = JSON.parse(data);
      } catch (error) {
        // 文件不存在或解析错误，返回空数组
        if (error.code === 'ENOENT') {
          return {
            memories: [],
            total: 0,
            query: query
          };
        }
        throw error;
      }
      
      // 如果记忆为空，直接返回
      if (!Array.isArray(memories) || memories.length === 0) {
        return {
          memories: [],
          total: 0,
          query: query
        };
      }
      
      // 准备查询字符串（转换为小写用于不区分大小写搜索）
      const queryLower = query.toLowerCase();
      const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
      
      // 计算每个记忆的相关性分数
      const memoriesWithScore = memories.map(memory => {
        let score = 0;
        
        // 1. 内容匹配（最高权重）
        if (memory.content) {
          const contentLower = memory.content.toLowerCase();
          queryTerms.forEach(term => {
            // 完整匹配加分
            if (contentLower.includes(term)) {
              score += 3;
            }
            // 部分匹配（前缀匹配）
            const words = contentLower.split(/\s+/);
            words.forEach(word => {
              if (word.startsWith(term)) {
                score += 1;
              }
            });
          });
        }
        
        // 2. 标签匹配
        if (memory.tags && Array.isArray(memory.tags)) {
          const tagsLower = memory.tags.map(tag => tag.toLowerCase());
          queryTerms.forEach(term => {
            tagsLower.forEach(tag => {
              if (tag.includes(term)) {
                score += 2;
              }
              // 标签前缀匹配
              if (tag.startsWith(term)) {
                score += 1;
              }
            });
          });
        }
        
        // 3. 时间匹配（如果查询包含时间相关词汇）
        if (memory.created_at) {
          const timeStr = memory.created_at.toLowerCase();
          queryTerms.forEach(term => {
            // 时间格式通常为"YYYY-MM-DD"或类似格式
            if (timeStr.includes(term)) {
              score += 1;
            }
          });
        }
        
        // 4. ID匹配（优先级最低）
        if (memory.id) {
          const idStr = String(memory.id).toLowerCase();
          queryTerms.forEach(term => {
            if (idStr.includes(term)) {
              score += 0.5;
            }
          });
        }
        
        return {
          ...memory,
          score: score
        };
      });
      
      // 过滤出有匹配结果的记忆（分数>0）
      const matchedMemories = memoriesWithScore
        .filter(memory => memory.score > 0)
        .sort((a, b) => {
          // 首先按分数降序排序
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          // 分数相同则按创建时间降序（最新的在前）
          return new Date(b.created_at) - new Date(a.created_at);
        })
        .slice(0, limit); // 限制返回数量
      
      // 格式化返回结果
      const result = {
        memories: matchedMemories.map(memory => ({
          id: memory.id,
          content: memory.content ? memory.content.substring(0, 200) + (memory.content.length > 200 ? '...' : '') : '',
          created_at: memory.created_at,
          score: memory.score,
          tags: memory.tags || []
        })),
        total: matchedMemories.length,
        query: query
      };
      
      return result;
      
    } catch (error) {
      console.error('Memory search error:', error);
      throw new Error(`Memory search failed: ${error.message}`);
    }
  }
};