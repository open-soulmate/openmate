const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'memory_search',
    description: '在系统的记忆库中进行关键词匹配搜索，用于快速检索相关信息、历史知识或上下文记忆。支持多关键词搜索，覆盖记忆内容、标签和创建时间字段，按相关性排序返回结果。',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '搜索关键词，多个关键词用空格分隔'
            },
            limit: {
                type: 'number',
                description: '返回结果的最大数量，默认10条',
                default: 10
            }
        },
        required: ['query']
    },
    execute: async ({ query, limit = 10 }) => {
        try {
            const memoryPath = path.join(__dirname, '..', 'data', 'memories.json');
            
            let memories = [];
            try {
                const data = await fs.readFile(memoryPath, 'utf-8');
                memories = JSON.parse(data);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return { results: [], total: 0 };
                }