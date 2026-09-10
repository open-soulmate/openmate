const fs = require('fs').promises;
const path = require('path');
const vm = require('vm');

/**
 * ToolForge Plugin
 * 实现工具自动创建的插件，可根据自然语言规范生成工具代码并注册到系统
 */
class ToolForge {
    constructor() {
        this.skillsDir = path.resolve(__dirname, '../skills');
        this.generatedDir = path.join(this.skillsDir, 'Generated');
        this.registryPath = path.join(this.skillsDir, 'index.json');
        this.template = this._getDefaultTemplate();
    }

    /**
     * 核心锻造函数 - 根据工具规范生成并注册工具
     * @param {Object} toolSpec - 工具规范对象
     * @param {string} toolSpec.name - 工具名称
     * @param {string} toolSpec.description - 工具描述
     * @param {Object} toolSpec.inputSchema - 输入参数模式
     * @param {Object} toolSpec.outputSchema - 输出参数模式
     * @returns {Promise<Object>} 生成结果
     */
    async forgeTool(toolSpec) {
        try {
            // 验证输入规范
            this._validateToolSpec(toolSpec);
            
            // 确保目录存在
            await this._ensureDirectoryExists(this.generatedDir);
            
            // 生成工具代码
            const toolCode = this._generateToolCode(toolSpec);
            
            // 校验生成的代码
            await this._validateCode(toolCode);
            
            // 写入工具文件
            const filePath = await this._writeToolFile(toolSpec.name, toolCode);
            
            // 更新注册表
            await this._updateRegistry(toolSpec, filePath);
            
            return {
                success: true,
                message: `工具 ${toolSpec.name} 创建成功`,
                filePath,
                toolCode
            };
        } catch (error) {
            return {
                success: false,
                message: `工具创建失败: ${error.message}`,
                error
            };
        }
    }

    /**
     * 验证工具规范
     */
    _validateToolSpec(toolSpec) {
        const requiredFields = ['name', 'description', 'inputSchema', 'outputSchema'];
        
        for (const field of requiredFields) {
            if (!toolSpec[field]) {
                throw new Error(`缺少必要字段: ${field}`);
            }
        }
        
        if (typeof toolSpec.name !== 'string' || !toolSpec.name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            throw new Error('工具名称必须为有效的JavaScript标识符');
        }
        
        if (typeof toolSpec.description !== 'string') {
            throw new Error('工具描述必须为字符串');
        }
    }

    /**
     * 生成工具代码
     */
    _generateToolCode(toolSpec) {
        let code = this.template;
        
        // 替换模板中的占位符
        code = code.replace(/__TOOL_NAME__/g, toolSpec.name);
        code = code.replace(/__TOOL_DESCRIPTION__/g, toolSpec.description);
        code = code.replace(/__INPUT_SCHEMA__/g, JSON.stringify(toolSpec.inputSchema, null, 2));
        code = code.replace(/__OUTPUT_SCHEMA__/g, JSON.stringify(toolSpec.outputSchema, null, 2));
        
        return code;
    }

    /**
     * 获取默认代码模板
     */
    _getDefaultTemplate() {
        return `/**
 * 自动生成的工具: __TOOL_NAME__
 * 描述: __TOOL_DESCRIPTION__
 * 生成时间: ${new Date().toISOString()}
 */

const inputSchema = __INPUT_SCHEMA__;
const outputSchema = __OUTPUT_SCHEMA__;

/**
 * 验证输入参数
 * @param {Object} input - 输入参数
 * @returns {Object} 验证结果
 */
function validateInput(input) {
    // 基础验证逻辑
    if (!input || typeof input !== 'object') {
        throw new Error('输入必须是一个对象');
    }
    
    // 检查必要字段（如果schema中有required字段）
    if (inputSchema.required) {
        for (const field of inputSchema.required) {
            if (!(field in input)) {
                throw new Error(\`缺少必要参数: \${field}\`);
            }
        }
    }
    
    return { valid: true, input };
}

/**
 * 验证输出结果
 * @param {Object} output - 输出结果
 * @returns {Object} 验证后的输出
 */
function validateOutput(output) {
    if (!output || typeof output !== 'object') {
        throw new Error('输出必须是一个对象');
    }
    
    return output;
}

/**
 * 工具执行函数
 * @param {Object} input - 输入参数
 * @returns {Promise<Object>} 执行结果
 */
async function execute(input) {
    try {
        // 验证输入
        const validatedInput = validateInput(input);
        
        // 在此处添加具体实现逻辑
        // TODO: 根据工具描述实现核心功能
        const result = {
            success: true,
            input: validatedInput.input,
            message: "工具执行完成",
            timestamp: new Date().toISOString(),
            // 添加工具特定的输出
            data: null
        };
        
        // 验证输出
        const validatedOutput = validateOutput(result);
        
        return validatedOutput;
    } catch (error) {
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 导出工具
module.exports = {
    name: '__TOOL_NAME__',
    description: '__TOOL_DESCRIPTION__',
    inputSchema,
    outputSchema,
    execute,
    
    // 工具元信息
    metadata: {
        version: '1.0.0',
        author: 'ToolForge',
        created: '${new Date().toISOString()}',
        tags: ['auto-generated']
    }
};
`;
    }

    /**
     * 验证生成的代码是否可以被Node.js解析
     */
    async _validateCode(code) {
        try {
            // 使用vm模块验证代码语法
            new vm.Script(code, {
                filename: 'generated-tool.js'
            });
            
            return true;
        } catch (error) {
            throw new Error(`代码语法错误: ${error.message}`);
        }
    }

    /**
     * 写入工具文件
     */
    async _writeToolFile(toolName, code) {
        const fileName = `${toolName}.js`;
        const filePath = path.join(this.generatedDir, fileName);
        
        await fs.writeFile(filePath, code, 'utf8');
        
        return filePath;
    }

    /**
     * 更新注册表
     */
    async _updateRegistry(toolSpec, filePath) {
        let registry = {};
        
        try {
            const registryContent = await fs.readFile(this.registryPath, 'utf8');
            registry = JSON.parse(registryContent);
        } catch (error) {
            // 如果文件不存在或内容无效，使用空对象
            registry = { tools: [] };
        }
        
        // 确保tools数组存在
        if (!registry.tools) {
            registry.tools = [];
        }
        
        // 检查工具是否已存在
        const existingIndex = registry.tools.findIndex(t => t.name === toolSpec.name);
        
        const toolEntry = {
            name: toolSpec.name,
            description: toolSpec.description,
            filePath: path.relative(this.skillsDir, filePath),
            inputSchema: toolSpec.inputSchema,
            outputSchema: toolSpec.outputSchema,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            // 更新现有条目
            registry.tools[existingIndex] = toolEntry;
        } else {
            // 添加新条目
            registry.tools.push(toolEntry);
        }
        
        // 更新注册表版本和时间戳
        registry.version = registry.version ? this._incrementVersion(registry.version) : '1.0.0';
        registry.lastUpdated = new Date().toISOString();
        
        // 写入注册表文件
        await fs.writeFile(
            this.registryPath, 
            JSON.stringify(registry, null, 2), 
            'utf8'
        );
        
        return registry;
    }

    /**
     * 确保目录存在
     */