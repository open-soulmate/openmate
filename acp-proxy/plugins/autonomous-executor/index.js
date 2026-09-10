'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

class AutonomousExecutor {
  constructor() {
    this.logs = [];
    this.sandboxDir = path.join(os.tmpdir(), `autonomous-executor-sandbox-${Date.now()}`);
    this.initSandbox();
  }

  initSandbox() {
    try {
      if (!fs.existsSync(this.sandboxDir)) {
        fs.mkdirSync(this.sandboxDir, { recursive: true });
      }
      // Create basic sandbox files for testing
      fs.writeFileSync(path.join(this.sandboxDir, 'package.json'), JSON.stringify({ name: 'sandbox', version: '1.0.0' }));
    } catch (error) {
      console.error('Failed to initialize sandbox:', error);
    }
  }

  evaluateTaskComplexity(description, requirements) {
    const lowRiskPatterns = [
      /修改配置文件/i,
      /更新.*?常量/i,
      /添加.*?日志/i,
      /修改.*?字符串/i,
      /更新.*?值/i,
      /添加.*?注释/i,
      /修改.*?格式/i,
      /更新.*?默认值/i,
      /调整.*?顺序/i,
      /修改.*?路径/i
    ];

    const complexPatterns = [
      /架构变更/i,
      /重构/i,
      /重新设计/i,
      /迁移/i,
      /大规模.*?修改/i,
      /新增.*?模块/i,
      /修改.*?接口/i,
      /变更.*?协议/i
    ];

    const combinedText = `${description} ${requirements || ''}`;
    
    const isLowRisk = lowRiskPatterns.some(pattern => pattern.test(combinedText));
    const isComplex = complexPatterns.some(pattern => pattern.test(combinedText));

    if (isComplex) return 'complex';
    if (isLowRisk) return 'low_risk';
    return 'moderate';
  }

  generateCodeSuggestion(description, requirements) {
    // Simple code suggestion generator based on task description
    const suggestions = [];
    
    if (/修改配置文件/i.test(description)) {
      suggestions.push({
        file: 'config.json',
        diff: `--- a/config.json\n+++ b/config.json\n@@ -1,3 +1,4 @@\n {\n-  "defaultPort": 3000\n+  "defaultPort": 3000,\n+  "enableLogging": true\n }\n`,
        language: 'json'
      });
    }

    if (/更新.*?常量/i.test(description)) {
      suggestions.push({
        file: 'constants.js',
        diff: `--- a/constants.js\n+++ b/constants.js\n@@ -1,3 +1,3 @@\n-const TIMEOUT = 5000;\n+const TIMEOUT = 10000;\n`,
        language: 'javascript'
      });
    }

    if (/添加.*?日志/i.test(description)) {
      suggestions.push({
        file: 'app.js',
        diff: `--- a/app.js\n+++ b/app.js\n@@ -1,3 +1,4 @@\n function startApp() {\n+  console.log('Application started');\n   initialize();\n }\n`,
        language: 'javascript'
      });
    }

    return suggestions;
  }

  applyInSandbox(suggestion) {
    try {
      const filePath = path.join(this.sandboxDir, suggestion.file);
      let originalContent = '';
      
      try {
        originalContent = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        // File doesn't exist, create empty
        originalContent = '';
      }

      // Simple diff application (for demo purposes)
      // In real implementation, we'd use a proper diff library
      let newContent = this.applySimpleDiff(originalContent, suggestion.diff);
      
      fs.writeFileSync(filePath, newContent);
      
      return {
        success: true,
        filePath,
        newContent
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  applySimpleDiff(content, diff) {
    // Simplified diff application - in real scenario, use proper patching
    if (diff.includes('"enableLogging": true')) {
      return content.replace(/"defaultPort": 3000/, '"defaultPort": 3000,\n  "enableLogging": true');
    }
    if (diff.includes('const TIMEOUT = 10000')) {
      return content.replace(/const TIMEOUT = 5000/, 'const TIMEOUT = 10000');
    }
    if (diff.includes("console.log('Application started')")) {
      return content.replace(/function startApp\(\) \{/, "function startApp() {\n  console.log('Application started');");
    }
    return content;
  }

  validateModification(filePath, language) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (language === 'json') {
        JSON.parse(content);
        return { valid: true, language: 'json' };
      }
      
      if (language === 'javascript') {
        // Try to compile the JavaScript code in a sandbox
        const script = new vm.Script(content, { filename: filePath });
        // We only check if it compiles, not if it runs
        script.compile();
        return { valid: true, language: 'javascript' };
      }

      // For other file types, basic syntax checking
      return { valid: true, language };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        language
      };
    }
  }

  logTask(taskDescription, status, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      task_description: taskDescription,
      status,
      details
    };
    
    this.logs.push(logEntry);
    return logEntry;
  }

  async execute(implementation) {
    const { description, requirements } = implementation;
    
    // Evaluate task complexity
    const complexity = this.evaluateTaskComplexity(description, requirements);
    
    if (complexity === 'complex') {
      const logEntry = this.logTask(
        description,
        'deferred_to_partner',
        'Task requires partner execution due to complexity'
      );
      
      return {
        success: false,
        status: 'deferred_to_partner',
        message: 'Task marked as requiring partner execution',
        log: logEntry
      };
    }

    // For low risk tasks, attempt autonomous execution
    const suggestions = this.generateCodeSuggestion(description, requirements);
    
    if (suggestions.length === 0) {
      const logEntry = this.logTask(
        description,
        'autonomous_fail',
        'No actionable code suggestions generated'
      );
      
      return {
        success: false,