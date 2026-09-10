// acp-proxy/skills/auto_analyze_and_integrate.js
const fs = require('fs').promises;
const path = require('path');

class AutoAnalyzeAndIntegrate {
  constructor() {
    this.name = 'auto_analyze_and_integrate';
    this.description = '探索-分析-内化闭环的核心技能';
    this.observationsPath = path.join(__dirname, '../data/observations.json');
    this.memoriesPath = path.join(__dirname, '../data/memories.json');
    this.skillsPath = path.join(__dirname, '../skills');
    this.logsPath = path.join(__dirname, '../data/analysis_logs');
  }

  async runAnalysisCycle() {
    try {
      console.log(`[${this.name}] 开始分析周期...`);
      
      // 1. 读取未分析的观察记录
      const unanalyzedObservations = await this._getUnanalyzedObservations();
      
      if (unanalyzedObservations.length === 0) {
        const message = '未发现需要分析的观察记录';
        console.log(`[${this.name}] ${message}`);
        return this._generateReport([], [], message);
      }
      
      console.log(`[${this.name}] 找到 ${unanalyzedObservations.length} 条未分析的观察记录`);
      
      // 2. 调用分析模型处理每条观察
      const analysisResults = [];
      const newSkills = [];
      const updatedSkills = [];
      
      for (const observation of unanalyzedObservations) {
        try {
          const analysis = await this._analyzeObservation(observation);
          analysisResults.push({
            observationId: observation.id,
            analysis: analysis,
            timestamp: new Date().toISOString()
          });
          
          // 3. 关联与内化分析结果
          const internalizationResult = await this._internalizeAnalysis(observation, analysis);
          
          if (internalizationResult.newSkills.length > 0) {
            newSkills.push(...internalizationResult.newSkills);
          }
          
          if (internalizationResult.updatedSkills.length > 0) {
            updatedSkills.push(...internalizationResult.updatedSkills);
          }
          
          // 4. 更新观察状态
          await this._markObservationAsAnalyzed(observation.id, analysis);
          
        } catch (error) {
          console.error(`[${this.name}] 分析观察记录 ${observation.id} 时出错:`, error);
          // 记录错误但不中断整个周期
          analysisResults.push({
            observationId: observation.id,
            analysis: { error: error.message },
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // 5. 生成分析报告
      const report = this._generateReport(analysisResults, newSkills, updatedSkills);
      
      // 6. 存储报告
      await this._storeReport(report);
      
      console.log(`[${this.name}] 分析周期完成，处理了 ${analysisResults.length} 条观察记录`);
      return report;
      
    } catch (error) {
      console.error(`[${this.name}] 分析周期执行失败:`, error);
      const errorReport = this._generateErrorReport(error);
      await this._storeReport(errorReport);
      throw error;
    }
  }
  
  async _getUnanalyzedObservations() {
    try {
      const data = await fs.readFile(this.observationsPath, 'utf8');
      const observations = JSON.parse(data);
      return observations.filter(obs => obs.analyzed === false);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
  
  async _analyzeObservation(observation) {
    // 这里实现分析逻辑，可能调用推理技能或直接与模型交互
    // 示例：简单的模式识别和总结
    const analysis = {
      type: observation.type || 'unknown',
      summary: this._generateSummary(observation),
      successFactors: this._identifySuccessFactors(observation),
      failurePatterns: this._identifyFailurePatterns(observation),
      reusablePatterns: this._extractPatterns(observation),
      recommendations: this._generateRecommendations(observation)
    };
    
    return analysis;
  }
  
  async _internalizeAnalysis(observation, analysis) {
    const result = {
      newSkills: [],
      updatedSkills: []
    };
    
    try {
      // 1. 更新记忆系统
      await this._updateMemories(observation, analysis);
      
      // 2. 检查是否需要创建新技能
      if (analysis.reusablePatterns && analysis.reusablePatterns.length > 0) {
        const newSkill = await this._createNewSkillFromPatterns(observation, analysis);
        if (newSkill) {
          result.newSkills.push(newSkill);
        }
      }
      
      // 3. 检查是否需要更新现有技能
      const skillUpdates = await this._updateExistingSkills(analysis);
      if (skillUpdates.length > 0) {
        result.updatedSkills.push(...skillUpdates);
      }
      
    } catch (error) {
      console.error(`[${this.name}] 内化分析结果时出错:`, error);
    }
    
    return result;
  }
  
  async _markObservationAsAnalyzed(observationId, analysis) {
    try {
      const data = await fs.readFile(this.observationsPath, 'utf8');
      const observations = JSON.parse(data);
      
      const updatedObservations = observations.map(obs => {
        if (obs.id === observationId) {
          return {
            ...obs,
            analyzed: true,
            analysisSummary: analysis.summary,
            analyzedAt: new Date().toISOString()
          };
        }
        return obs;
      });
      
      await fs.writeFile(this.observationsPath, JSON.stringify(updatedObservations, null, 2));
    } catch (error) {
      console.error(`[${this.name}] 更新观察记录状态失败:`, error);
      throw error;
    }
  }
  
  async _updateMemories(observation, analysis) {
    // 实现记忆更新逻辑
    try {
      const memories = await this._loadMemories();
      const memoryEntry = {
        timestamp: new Date().toISOString(),
        source: 'auto_analysis',
        observationId: observation.id,
        analysis: analysis,
        keyInsights: analysis.successFactors.concat(analysis.failurePatterns),
        patterns: analysis.reusablePatterns
      };
      
      memories.push(memoryEntry);
      
      // 保持记忆库在合理大小
      const maxMemories = 1000;
      if (memories.length > maxMemories) {
        memories.splice(0, memories.length - maxMemories);
      }
      
      await fs.writeFile(this.memoriesPath, JSON.stringify(memories, null, 2));
    } catch (error) {
      console.error(`[${this.name}] 更新记忆失败:`, error);
    }
  }
  
  async _loadMemories() {
    try {
      const data = await fs.readFile(this.memoriesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
  
  async _createNewSkillFromPatterns(observation, analysis) {