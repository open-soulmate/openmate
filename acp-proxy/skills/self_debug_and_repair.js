// acp-proxy/skills/self_debug_and_repair.js
const fs = require('fs').promises;
const path = require('path');

class SelfDebugAndRepair {
  constructor() {
    this.repairKnowledgeBase = new Map();
    this.maxRetries = 3;
    this.logPath = path.join(__dirname, '../logs/repair_knowledge.json');
    this._initKnowledgeBase();
  }

  async _initKnowledgeBase() {
    try {
      const data = await fs.readFile(this.logPath, 'utf8');
      const entries = JSON.parse(data);
      entries.forEach(([key, value]) => this.repairKnowledgeBase.set(key, value));
    } catch (error) {
      // 文件不存在或解析错误，从空知识库开始
    }
  }

  async _saveKnowledgeBase() {
    try {
      const data = JSON.stringify([...this.repairKnowledgeBase.entries()], null, 2);
      await fs.writeFile(this.logPath, data, 'utf8');
    } catch (error) {
      console.error('Failed to save repair knowledge base:', error);
    }
  }

  _analyzeErrorPattern(error) {
    const patterns = {
      PARAM_TYPE_ERROR: /type|typeof|expected.*received|invalid type/i,
      MISSING_PARAM: /missing|required|parameter.*not provided/i,
      RESOURCE_NOT_FOUND: /not found|does not exist|resource.*missing/i,
      NETWORK_ERROR: /network|timeout|connection|fetch failed/i,
      VALIDATION_ERROR: /validation|invalid|check failed/i
    };

    const errorMessage = error.message || error.toString();
    
    for (const [patternType, regex] of Object.entries(patterns)) {
      if (regex.test(errorMessage)) {
        return {
          type: patternType,
          message: errorMessage,
          match: regex.exec(errorMessage)[0]
        };
      }
    }

    return {
      type: 'UNKNOWN',
      message: errorMessage,
      match: null
    };
  }

  async _applyRepairStrategy(errorAnalysis, skillName, originalArgs, repairContext) {
    const repairKey = `${skillName}:${errorAnalysis.type}`;
    
    // 检查是否有已知的修复方案
    if (this.repairKnowledgeBase.has(repairKey)) {
      const knownRepair = this.repairKnowledgeBase.get(repairKey);
      if (knownRepair.successRate > 0.7) { // 成功率高于70%的方案
        return this._executeKnownRepair(knownRepair, originalArgs, repairContext);
      }
    }

    // 根据错误类型应用修复策略
    switch (errorAnalysis.type) {
      case 'PARAM_TYPE_ERROR':
        return this._repairParamType(originalArgs, repairContext);
      case 'MISSING_PARAM':
        return this._repairMissingParam(originalArgs, repairContext);
      case 'NETWORK_ERROR':
        return { shouldRetry: true, modifiedArgs: originalArgs };
      default:
        return { shouldRetry: false, modifiedArgs: originalArgs };
    }
  }

  _repairParamType(originalArgs, repairContext) {
    const repairedArgs = { ...originalArgs };
    
    if (repairContext && repairContext.expectedTypes) {
      for (const [param, expectedType] of Object.entries(repairContext.expectedTypes)) {
        if (repairedArgs[param] !== undefined) {
          try {
            switch (expectedType) {
              case 'number':
                repairedArgs[param] = Number(repairedArgs[param]);
                break;
              case 'string':
                repairedArgs[param] = String(repairedArgs[param]);
                break;
              case 'boolean':
                repairedArgs[param] = Boolean(repairedArgs[param]);
                break;
              case 'array':
                if (!Array.isArray(repairedArgs[param])) {
                  repairedArgs[param] = [repairedArgs[param]];
                }
                break;
            }
          } catch (e) {
            // 转换失败，保持原值
          }
        }
      }
    }

    return { shouldRetry: true, modifiedArgs: repairedArgs };
  }

  _repairMissingParam(originalArgs, repairContext) {
    const repairedArgs = { ...originalArgs };
    
    if (repairContext && repairContext.defaultValues) {
      for (const [param, defaultValue] of Object.entries(repairContext.defaultValues)) {
        if (repairedArgs[param] === undefined || repairedArgs[param] === null) {
          repairedArgs[param] = defaultValue;
        }
      }
    }

    return { shouldRetry: true, modifiedArgs: repairedArgs };
  }

  _executeKnownRepair(knownRepair, originalArgs, repairContext) {
    // 执行已知的修复方案
    if (knownRepair.repairFunction) {
      try {
        const repairedArgs = knownRepair.repairFunction(originalArgs, repairContext);
        return { shouldRetry: true, modifiedArgs: repairedArgs };
      } catch (e) {