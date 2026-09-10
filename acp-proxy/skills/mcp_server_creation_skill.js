/**
 * MCP Server Creation Skill
 * 赋能代理的"自编程能力"和"工具创造"目标
 * 根据高层需求描述自动生成完整的MCP服务器代码
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析需求字符串，提取工具相关信息
 * @param {string} requirement - 需求描述
 * @returns {Object} 解析后的工具定义
 */
function parseRequirement(requirement) {
    // 从需求中提取关键信息
    const requirementLower = requirement.toLowerCase();
    
    // 默认工具定义
    const toolDefinition = {
        name: 'custom_tool',
        description: requirement,
        language: 'node',
        parameters: [],
        returnType: 'object'
    };

    // 尝试从需求中提取工具名称
    const namePatterns = [
        /(?:创建|开发|实现)(?:一个|个)?(?:能|可以|用于)?(.+?)(?:的|工具|服务|服务)/,
        /(?:tool|server|service)(?:\s+(?:for|to|that)\s+)(.+)/i
    ];
    
    for (const pattern of namePatterns) {
        const match = requirement.match(pattern);
        if (match) {
            toolDefinition.name = sanitizeName(match[1]);
            break;
        }
    }

    // 检测编程语言偏好
    if (requirementLower.includes('python') || requirementLower.includes('py')) {
        toolDefinition.language = 'python';
    }

    // 根据常见需求类型添加参数
    if (requirementLower.includes('天气') || requirementLower.includes('weather')) {
        toolDefinition.name = 'weather_query';
        toolDefinition.parameters = [
            { name: 'city', type: 'string', description: '城市名称', required: true },
            { name: 'unit', type: 'string', description: '温度单位 (celsius/fahrenheit)', required: false, default: 'celsius' }
        ];
    } else if (requirementLower.includes('翻译') || requirementLower.includes('translate')) {
        toolDefinition.name = 'text_translate';
        toolDefinition.parameters = [
            { name: 'text', type: 'string', description: '要翻译的文本', required: true },
            { name: 'source_lang', type: 'string', description: '源语言', required: false, default: 'auto' },
            { name: 'target_lang', type: 'string', description: '目标语言', required: true }
        ];
    } else if (requirementLower.includes('计算') || requirementLower.includes('calculate')) {
        toolDefinition.name = 'calculator';
        toolDefinition.parameters = [
            { name: 'expression', type: 'string', description: '数学表达式', required: true }
        ];
    } else if (requirementLower.includes('搜索') || requirementLower.includes('search')) {
        toolDefinition.name = 'web_search';
        toolDefinition.parameters = [
            { name: 'query', type: 'string', description: '搜索关键词', required: true },
            { name: 'limit', type: 'number', description: '返回结果数量', required: false, default: 10 }
        ];
    } else if (requirementLower.includes('文件') || requirementLower.includes('file')) {
        toolDefinition.name = 'file_processor';
        toolDefinition.parameters = [
            { name: 'file_path', type: 'string', description: '文件路径', required: true },
            { name: 'operation', type: 'string', description: '操作类型 (read/write/delete)', required: true }
        ];
    } else {
        // 通用参数模板
        toolDefinition.parameters = [
            { name: 'input', type: 'string', description: '输入数据', required: true },
            { name: 'options', type: 'object', description: '可选配置项', required: false, default: {} }
        ];
    }

    return toolDefinition;
}

/**
 * 清理并规范化名称
 */
function sanitizeName(name) {
    return name
        .trim()
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 50) || 'custom_tool';
}

/**
 * 生成 Node.js MCP Server 代码
 */
function generateNodeServerCode(toolDef) {
    const paramsDef = toolDef.parameters.map(p => {
        const required = p.required ? '' : '?';
        return `    ${p.name}${required}: ${p.type}`;
    }).join(',\n');

    const paramsDescription = toolDef.parameters.map(p => 
        `    // - ${p.name}: ${p.description}${p.default !== undefined ? ` (默认: ${p.default})` : ''}`
    ).join('\n');

    const paramValidation = toolDef.parameters
        .filter(p => p.required)
        .map(p => `    if (!args.${p.name}) {\n      throw new Error('Missing required parameter: ${p.name}');\n    }`)
        .join('\n');

    return `#!/usr/bin/env node

/**
 * MCP Server: ${toolDef.name}
 * ${toolDef.description}
 * 
 * 自动生成的MCP服务器代码
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 工具定义
const TOOL_DEFINITION = {
    name: '${toolDef.name}',
    description: '${toolDef.description}',
    inputSchema: {
        type: 'object',
        properties: {
${toolDef.parameters.map(p => `            ${p.name}: {
                type: '${p.type}',
                description: '${p.description}'${p.default !== undefined ? `,\n                default: ${JSON.stringify(p.default)}` : ''}
            }`).join(',\n')}
        },
        required: [${toolDef.parameters.filter(p => p.required).map(p => `'${p.name}'`).join(', ')}]
    }
};

/**
 * 执行工具的核心逻辑
 * 参数说明:
${paramsDescription}
 */
async function executeTool(args) {
    // 参数验证
${paramValidation || '    // 无需验证必填参数'}

    // ========================================
    // TODO: 在此处实现您的业务逻辑
    // ========================================
    
    // 示例实现 - 请根据实际需求修改
    console.error(\`Executing ${toolDef.name} with args:\`, JSON.stringify(args));
    
    const result = {
        success: true,
        tool: '${toolDef.name}',