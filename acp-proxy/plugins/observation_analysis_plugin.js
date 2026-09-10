class ObservationAnalysisPlugin {
  constructor(config = {}) {
    this.pluginId = 'observation_analysis_plugin';
    this.unanalyzedObservations = [];
    this.deepAnalysisThreshold = config.deepAnalysisThreshold || 2;
    this.analysisSkillId = config.analysisSkillId || 'data_insight_skill';
    this.lastAnalysisTime = Date.now();
    
    // 依赖注入
    this.skillExecutor = config.skillExecutor;
    this.memoryStore = config.memoryStore;
    this.logger = config.logger || console;
    
    this.analysisContext = {
      cycleId: config.cycleId || 'default_cycle',
      pluginId: this.pluginId,
      analysisType: 'observation_pattern'
    };
  }

  async processObservation(observation) {
    try {
      // 1. 添加观察到待分析列表
      const processedObservation = {
        id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        data: observation,
        analyzed: false,
        cycleId: this.analysisContext.cycleId
      };
      
      this.unanalyzedObservations.push(processedObservation);
      
      // 2. 检查是否需要触发深度分析
      if (this.unanalyzedObservations.length >= this.deepAnalysisThreshold) {
        await this.triggerDeepAnalysis();
      }
      
      return {
        success: true,
        observationId: processedObservation.id,
        pendingAnalysis: this.unanalyzedObservations.length
      };
    } catch (error) {
      this.logger.error(`处理观察失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async triggerDeepAnalysis() {
    if (!this.skillExecutor) {
      this.logger.warn('技能执行器未初始化，无法执行深度分析');
      return;
    }

    try {
      this.logger.info(`触发深度分析，待分析观察数: ${this.unanalyzedObservations.length}`);
      
      // 3. 准备分析上下文
      const analysisPayload = {
        observations: this.unanalyizedObservations.map(obs => ({
          id: obs.id,
          data: obs.data,
          timestamp: obs.timestamp
        })),
        context: {
          ...this.analysisContext,
          analysisTrigger: 'threshold_reached',
          observationCount: this.unanalyizedObservations.length,
          analysisStartTime: Date.now()
        }
      };
      
      // 4. 调用分析技能
      const analysisResult = await this.skillExecutor.executeSkill(
        this.analysisSkillId,
        analysisPayload
      );
      
      if (analysisResult && analysisResult.success) {
        // 5. 将分析结果存储为见解
        await this.storeAnalysisInsight(analysisResult.data, analysisPayload);
        
        // 6. 重置分析状态
        this.markObservationsAsAnalyzed();
        this.lastAnalysisTime = Date.now();
      }
    } catch (error) {
      this.logger.error(`深度分析执行失败: ${error.message}`);
    }
  }

  async storeAnalysisInsight(analysisData, analysisContext) {
    if (!this.memoryStore) {
      this.logger.warn('记忆存储未初始化，无法存储分析见解');
      return;
    }

    try {
      // 格式化见解记忆
      const insightMemory = {
        type: 'analysis_insight',
        pluginId: this.pluginId,
        timestamp: Date.now(),
        analysisSkill: this.analysisSkillId,
        observationCount: analysisContext.observations.length,
        context: analysisContext.context,
        insight: this.formatInsight(analysisData),
        metadata: {
          analysisId: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          analysisDuration: Date.now() - analysisContext.context.analysisStartTime
        }
      };
      
      // 存储到记忆系统
      const memoryId = await this.memoryStore.storeMemory(insightMemory);
      
      this.logger.info(`分析见解已存储，记忆ID: ${memoryId}`);
      return memoryId;
    } catch (error) {
      this.logger.error(`存储分析见解失败: ${error.message}`);
      throw error;
    }
  }

  formatInsight(analysisData) {
    // 格式化分析结果为结构化的见解文本
    if (typeof analysisData === 'string') {
      return {
        summary: analysisData,
        formattedAt: Date.now()
      };
    }
    
    return {
      summary: analysisData.summary || '分析完成',
      patterns: analysisData.patterns || [],
      trends: analysisData.trends || [],
      recommendations: analysisData.recommendations || [],
      diagnostics: analysisData.diagnostics || [],
      formattedAt: Date.now()
    };
  }

  markObservationsAsAnalyzed() {
    this.unanalyzedObservations.forEach(obs => {
      obs.analyzed = true;
      obs.analyzedAt = Date.now();
    });
    
    // 清理已分析的观察（可选保留最近的N条）
    this.unanalyzedObservations = this.unanalyzedObservations.filter(obs => !obs.analyzed);
  }

  // 辅助方法：手动触发分析
  async forceAnalysis() {
    if (this.unanalyzedObservations.length > 0) {
      await this.triggerDeepAnalysis();
    }
  }

  // 获取插件状态
  getStatus() {
    return {
      pluginId: this.pluginId,
      pendingObservations: this.unanalyzedObservations.length,
      threshold: this.deepAnalysisThreshold,
      lastAnalysisTime: this.lastAnalysisTime,
      analysisSkillId: this.analysisSkillId
    };
  }

  // 更新阈值配置
  updateThreshold(newThreshold) {
    this.deepAnalysisThreshold = newThreshold;
    this.logger.info(`深度分析阈值已更新为: ${newThreshold}`);
  }
}

// 导出插件类和工厂函数
module.exports = {
  ObservationAnalysisPlugin,
  
  // 工厂函数用于创建插件实例
  createPlugin(config = {}) {
    return new ObservationAnalysisPlugin(config);
  },
  
  // 默认配置
  defaultConfig: {
    deepAnalysisThreshold: 2,