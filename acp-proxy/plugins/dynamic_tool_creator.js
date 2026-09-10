const vm = require('vm');

class DynamicToolCreatorPlugin {
  constructor() {
    this.toolRegistry = new Map();
    this.disabledTools = new Set();
    this.availableCommands = [
      '/create_tool',
      '/list_tools',
      '/disable_tool',
      '/delete_tool'
    ];
  }

  async onLoad(context) {
    this.context = context;
    console.log('DynamicToolCreatorPlugin loaded');
  }

  async onMessage(message, context) {
    const text = message.text || message.content || '';
    
    if (text.startsWith('/create_tool')) {
      await this.handleCreateToolCommand(text);
    } else if (text === '/list_tools') {
      await this.handleListToolsCommand();
    } else if (text.startsWith('/disable_tool')) {
      await this.handleDisableToolCommand(text);
    } else if (text.startsWith('/delete_tool')) {
      await this.handleDeleteToolCommand(text);
    }
    
    return null;
  }

  async handleCreateToolCommand(text) {
    try {
      const specString = text.substring('/create_tool'.length).trim();
      const toolSpec = JSON.parse(specString);
      
      if (!this.validateToolSpec(toolSpec)) {
        console.error('Invalid tool specification');
        return;
      }
      
      const toolDefinition = this.createMCPTool(toolSpec);
      this.registerTool(toolDefinition);
      
      console.log(`Tool "${toolSpec.name}" created and registered successfully`);
    } catch (error) {
      console.error('Failed to create tool:', error.message);
    }
  }

  async handleListToolsCommand() {
    const tools = this.getAvailableTools();
    console.log('Available tools:', JSON.stringify(tools, null, 2));
  }

  async handleDisableToolCommand(text) {
    const toolName = text.substring('/disable_tool'.length).trim();
    this.disableTool(toolName);
  }

  async handleDeleteToolCommand(text) {
    const toolName = text.substring('/delete_tool'.length).trim();
    this.deleteTool(toolName);
  }

  validateToolSpec(toolSpec) {
    const requiredFields = ['name', 'description', 'parameters', 'functionBody'];
    
    for (const field of requiredFields) {
      if (!(field in toolSpec)) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }
    
    if (typeof toolSpec.name !== 'string' || toolSpec.name.trim() === '') {
      console.error('Tool name must be a non-empty string');
      return false;
    }
    
    if (typeof toolSpec.description !== 'string') {
      console.error('Tool description must be a string');
      return false;
    }
    
    if (typeof toolSpec.parameters !== 'object' || toolSpec.parameters === null) {
      console.error('Parameters must be a JSON object (JSON Schema)');
      return false;
    }
    
    if (typeof toolSpec.functionBody !== 'string') {
      console.error('Function body must be a string');
      return false;
    }
    
    // Basic security checks on functionBody
    const forbiddenPatterns = [
      /require\s*\(/i,
      /import\s+/i,
      /process\./i,
      /global\./i,
      /window\./i,
      /eval\s*\(/i,
      /Function\s*\(/i,
      /__dirname/i,
      /__filename/i
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(toolSpec.functionBody)) {
        console.error('Function body contains forbidden code patterns');
        return false;
      }
    }
    
    return true;
  }

  createMCPTool(toolSpec) {
    const toolDefinition = {
      name: toolSpec.name,
      description: toolSpec.description,
      parameters: toolSpec.parameters,
      execute: this.createSandboxedFunction(toolSpec.functionBody, toolSpec.parameters)
    };
    
    return toolDefinition;
  }

  createSandboxedFunction(functionBody, parameters) {
    // Create a sandboxed context with limited globals
    const sandbox = {
      console: {
        log: (...args) => console.log('[Tool]', ...args),
        error: (...args) => console.error('[Tool]', ...args)
      },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      JSON: JSON,
      Math: Math,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      Date: Date,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp
    };
    
    // Create a restricted Function constructor in the sandbox
    const context = vm.createContext(sandbox);
    
    // Build the wrapper function
    const wrapperCode = `