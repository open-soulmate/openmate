const vm = require('vm');
const fs = require('fs');
const path = require('path');

class AutonomousExecutorPlugin {
  constructor() {
    this.logs = [];
    this.sandbox = this.createSandbox();
  }

  createSandbox() {
    const mockFileSystem = {};
    
    return {
      console: {
        log: (msg) => this.addLog('sandbox', `Console: ${msg}`)
      },
      JSON: JSON,
      fs: {
        readFile: (filePath) => {
          return mockFileSystem[filePath] || null;
        },
        writeFile: (filePath, content) => {
          mockFileSystem[filePath] = content;
          return true;
        },
        existsSync: (filePath) => {
          return !!mockFileSystem[filePath];
        }
      },
      require: (module) => {
        if (module === 'path') return path;
        if (module === 'fs') return this.sandbox.fs;
        throw new Error(`Module ${module} not allowed in sandbox`);
      },
      path: path,
      setTimeout: (fn, delay) => setTimeout(fn, delay),
      clearTimeout: (id) => clearTimeout(id),
      setInterval: (fn, interval) => setInterval(fn, interval),
      clearInterval: (id) => clearInterval(id),
      Math: Math,
      Date: Date,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Array: Array,
      Object: Object,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,
      RangeError: RangeError,
      SyntaxError: SyntaxError,
      ReferenceError: ReferenceError,
      mockFileSystem: mockFileSystem
    };
  }

  addLog(category, message, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      task_description: details.description || 'N/A',
      status: details.status || 'info',
      details: {
        category,
        message,
        ...details
      }
    };
    this.logs.push(logEntry);
    console.log(`[${category.toUpperCase()}] ${message}`);
    return logEntry;
  }

  assessTaskComplexity(description, requirements) {
    const lowRiskKeywords = [
      '修改', '更新', '添加一个', '配置文件', '常量', '日志',
      '调整', '更改', '设置', '文本', '字符串', '值',
      '版本号', '注释', '空格', '换行', '缩进'
    ];
    
    const complexKeywords = [
      '架构', '重构', '算法', '数据库', '模式', '并发',
      '多线程', '网络', '安全', '加密', '认证', '权限',
      '性能优化', '缓存', '分布式', '微服务', 'API', '系统'
    ];

    const textToAnalyze = `${description} ${requirements}`.toLowerCase();
    
    const hasLowRisk = lowRiskKeywords.some(keyword => 
      textToAnalyze.includes(keyword.toLowerCase())
    );
    
    const hasComplex = complexKeywords.some(keyword => 
      textToAnalyze.includes(keyword.toLowerCase())
    );

    if (hasComplex && !hasLowRisk) {
      return { complexity: 'complex', reason: '包含复杂系统关键词' };
    }
    
    if (hasLowRisk && !hasComplex) {
      return { complexity: 'low_risk', reason: '包含低风险模式化关键词' };
    }
    
    if (hasLowRisk && hasComplex) {
      return { complexity: 'moderate', reason: '混合关键词，需要进一步分析' };
    }
    
    return { complexity: 'unknown', reason: '无法确定复杂度，标记为复杂' };
  }

  generateCodeModification(description, requirements) {
    // 模拟基于描述生成代码修改建议
    const mockDiff = {
      file: this.inferTargetFile(description, requirements),
      changes: this.inferChanges(description, requirements),
      reasoning: `基于任务描述 "${description}" 生成的修改建议`
    };
    
    return mockDiff;
  }

  inferTargetFile(description, requirements) {
    const text = `${description} ${requirements}`.toLowerCase();
    
    if (text.includes('配置') || text.includes('config')) {
      return 'config.json';
    }
    if (text.includes('日志') || text.includes('log')) {
      return 'logger.js';
    }
    if (text.includes('常量') || text.includes('constant')) {
      return 'constants.js';
    }
    if (text.includes('样式') || text.includes('css')) {
      return 'styles.css';
    }
    
    return 'unknown_file.txt';
  }

  inferChanges(description, requirements) {
    const text = `${description} ${requirements}`.toLowerCase();
    
    if (text.includes('版本') || text.includes('version')) {
      return [{
        type: 'update',
        old: '"version": "1.0.0"',
        new: '"version": "1.1.0"'
      }];
    }
    
    if (text.includes('日志') && text.includes('添加')) {
      return [{
        type: 'add',
        content: 'console.log("添加的日志输出");',
        line: 10
      }];
    }
    
    if (text.includes('常量') && text.includes('修改')) {
      return [{
        type: 'update',
        old: 'MAX_RETRIES = 3',
        new: 'MAX_RETRIES = 5'
      }];
    }
    
    return [{
      type: 'modify',
      description: '根据描述进行通用修改',
      suggestion: '需要根据具体需求细化修改内容'
    }];
  }

  validateModification(diff, fileContent) {
    const validationResults = [];
    
    try {
      // 1. 检查文件路径是否有效
      if (!diff.file || diff.file === 'unknown_file.txt') {
        validationResults.push({
          check: 'file_path',
          passed: false,
          message: '无法确定目标文件路径'
        });
      } else {
        validationResults.push({