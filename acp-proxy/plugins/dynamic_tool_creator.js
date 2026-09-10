'use strict';

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class DynamicToolCreatorPlugin {
  constructor() {
    this.toolsRegistry = new Map();
    this.creatorPattern = /^\/create_tool\s*/i;
    this.initialized = false;
  }

  async onLoad(context) {
    this.context = context;
    this.logger = context.logger || console;
    this.initialized = true;
    
    this.logger.info('DynamicToolCreatorPlugin loaded successfully');
    
    return {
      name: 'dynamic_tool_creator',
      description: 'Dynamic tool creation engine for extending agent capabilities',
      version: '1.0.0'
    };
  }

  async onMessage(message, context) {
    if (!this.initialized) {
      return { error: 'Plugin not initialized' };
    }

    try {
      const messageText = message.text || message.content || '';
      
      if (this.creatorPattern.test(messageText)) {
        return await this.handleToolCreationRequest(messageText, context);
      }
      
      const toolName = message.toolName || message.function;
      if (toolName && this.toolsRegistry.has(toolName)) {
        return await this.executeTool(toolName, message.parameters || message.args || {}, context);
      }
      
      return null;
    } catch (error) {
      this.logger.error('Plugin error:', error);
      return { error: `Plugin processing error: ${error.message}` };
    }
  }

  async handleToolCreationRequest(messageText, context) {
    const jsonMatch = messageText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        error: 'Invalid tool specification. Please provide JSON format.',
        example: {
          name: 'tool_name',
          description: 'What the tool does',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string', description: 'Example parameter' }
            },
            required: ['param1']
          },
          functionBody: 'return { result: "Hello " + args.param1 };'
        }
      };
    }

    try {
      const toolSpec = JSON.parse(jsonMatch[0]);
      const result = await this.createMCPTool(toolSpec);
      
      return {
        type: 'tool_creation_result',
        success: true,
        toolId: result.toolId,
        message: `Tool "${toolSpec.name}" created successfully and is now available.`,
        toolSpec: {
          name: result.name,
          description: result.description,
          parameters: result.parameters,
          created: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        error: `Failed to create tool: ${error.message}`,
        details: this.validateToolSpec(JSON.parse(jsonMatch[0]))
      };
    }
  }

  createMCPTool(toolSpec) {
    const validation = this.validateToolSpec(toolSpec);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const toolId = `tool_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
    
    const safeExecute = this.createSandboxedFunction(toolSpec.functionBody, toolSpec.parameters);
    
    const mcpTool = {
      id: toolId,
      name: toolSpec.name,
      description: toolSpec.description,
      parameters: toolSpec.parameters,
      execute: safeExecute,
      metadata: {
        createdBy: 'dynamic_tool_creator',
        created: new Date().toISOString(),
        lastUsed: null,
        useCount: 0,
        version: '1.0.0'
      }
    };

    this.toolsRegistry.set(toolSpec.name, mcpTool);
    
    if (this.context && this.context.tools) {
      this.context.tools[toolSpec.name] = safeExecute;
    }

    this.logger.info(`Tool created: ${toolSpec.name} (${toolId})`);
    
    return {
      toolId: toolId,
      name: toolSpec.name,
      description: toolSpec.description,
      parameters: toolSpec.parameters
    };
  }

  createSandboxedFunction(functionBody, parameterSchema) {
    const paramNames = Object.keys(parameterSchema.properties || {});
    
    return async (args = {}) => {
      const sanitizedArgs = {};
      for (const param of paramNames) {
        if (args[param] !== undefined) {
          sanitizedArgs[param] = this.sanitizeInput(args[param], parameterSchema.properties[param]);
        }
      }

      const sandboxProxy = new Proxy(Object.create(null), {
        get: (target, prop) => {
          if (prop === 'args' || prop === 'arguments') return sanitizedArgs;
          if (prop === 'console') return {
            log: (...a) => this.logger.debug('[Sandbox]', ...a),
            warn: (...a) => this.logger.warn('[Sandbox]', ...a),
            error: (...a) => this.logger.error('[Sandbox]', ...a)
          };
          if (prop === 'JSON') return JSON;
          if (prop === 'Math') return Math;
          if (prop === 'Date') return Date;
          if (prop === 'String') return String;
          if (prop === 'Number') return Number;
          if (prop === 'Boolean') return Boolean;
          if (prop === 'Array') return Array;
          if (prop === 'Object') return Object;
          if (prop === 'RegExp') return RegExp;
          if (prop === 'parseInt') return parseInt;
          if (prop === 'parseFloat') return parseFloat;
          if (prop === 'isNaN') return isNaN;
          if (prop === 'isFinite') return isFinite;
          return undefined;
        },
        set: () => {
          throw new Error('Setting global variables in sandbox is not allowed');
        }
      });

      const wrappedFunctionBody = `
        'use strict';
        return (async function() {
          ${functionBody}
        }).call(this);
      `;

      try {
        const fn = new Function('sandbox', `
          with(sandbox) {
            ${wrappedFunctionBody}
          }
        `);
        
        const result = await fn.call(sandboxProxy, sandboxProxy);
        return this.sanitizeOutput(result);
      } catch (error) {
        this.logger.error('Sandbox execution error:', error);
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    };
  }

  sanitizeInput(value, schema) {
    if (value === null || value === undefined) {
      return schema.default !== undefined ? schema.default : null;
    }

    const type = schema.type;
    if (type === 'string') {
      return String(value).replace(/[<>]/g, '');
    }
    if (type === 'number' || type === 'integer') {
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    }
    if (type === 'boolean') {
      return Boolean(value);
    }
    if (type === 'array' && Array.isArray(value)) {
      return value.map(item => this.sanitizeInput(item, schema.items || {}));
    }
    if (type === 'object' && typeof value === 'object') {
      const sanitized = {};
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          sanitized[key] = this.sanitizeInput(value[key], schema.properties?.[key] || {});
        }
      }
      return sanitized;
    }
    return value;
  }

  sanitizeOutput(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT REMOVED]');
    }
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeOutput(item));
    }
    if (typeof value === 'object') {
      const sanitized = {};
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          sanitized[key] = this.sanitizeOutput(value[key]);
        }
      }
      return sanitized;
    }
    return value;
  }

  validateToolSpec(toolSpec) {
    const errors = [];

    if (!toolSpec || typeof toolSpec !== 'object') {
      return { valid: false, errors: ['Tool specification must be an object'] };
    }

    if (!toolSpec.name || typeof toolSpec.name !== 'string') {
      errors.push('Missing or invalid tool name (must be non-empty string)');