const fs = require('fs');
const path = require('path');

const MEMORY_FILE_PATH = path.join(__dirname, '..', 'data', 'memories.json');

module.exports = {
  name: 'memory_search',
  description: '在系统记忆库中进行关键词匹配搜索，支持搜索记忆内容、标签和创建时间字段，用于快速检索相关记忆，优化知识积累效率。返回按相关性排序的记忆条目，每条包含ID、内容摘要和创建时间。',
  
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，用于匹配记忆内容、标签和创建时间'
      },
      limit: {
        type: 'number',
        description: '返回结果的最大数量，默认为10',
        default: 10,
        minimum: 1,
        maximum: 100
      }
    },
    required: ['query']
  },
  
  execute: async function({ query, limit = 10 }) {
    try {
      // 读取记忆文件
      let memories = [];
      if (fs.existsSync(MEMORY_FILE_PATH)) {
        const fileContent = fs.readFileSync(MEMORY_FILE_PATH, 'utf8');
        memories = JSON.parse(fileContent);
      }
      
      // 处理搜索查询
      const queryLower = query.toLowerCase();
      const results = [];
      
      for (const memory of memories) {
        let matchScore = 0;
        
        // 搜索内容字段
        if (memory.content && memory.content.toLowerCase().includes(queryLower)) {
          matchScore += 2; // 内容匹配权重较高
        }
        
        // 搜索标签字段（如果有）
        if (memory.tags && Array.isArray(memory.tags)) {
          for (const tag of memory.tags) {
            if (tag.toLowerCase().includes(queryLower)) {
              matchScore += 1;
              break; // 标签只匹配一次
            }
          }
        }
        
        // 搜索创建时间字段（如果有）
        if (memory.created_at) {
          const createdAtStr = memory.created_at.toString();
          if (createdAtStr.includes(query)) {
            matchScore += 0.5; // 时间匹配权重较低
          }
        }
        
        // 如果有匹配，添加到结果中
        if (matchScore > 0) {
          // 创建内容摘要（最多100个字符）
          const contentSummary = memory.content 
            ? memory.content.length > 100 
              ? memory.content.substring(0, 100) + '...' 
              : memory.content
            : 'No content';
          
          results.push({
            id: memory.id,
            content: contentSummary,
            created_at: memory.created_at,
            match_score: matchScore
          });
        }
      }
      
      // 按匹配分数降序排序，分数相同按创建时间降序
      results.sort((a, b) => {
        if (b.match_score !== a.match_score) {
          return b.match_score - a.match_score;
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });
      
      // 限制结果数量并移除匹配分数
      const limitedResults = results.slice(0, limit).map(({ match_score, ...rest }) => rest);
      
      return {
        success: true,
        query: query,
        count: limitedResults.length,
        total_matches: results.length,
        results: limitedResults
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        query: query,
        results: []
      };
    }
  }
};