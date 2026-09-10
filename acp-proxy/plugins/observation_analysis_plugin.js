/**
 * 观察分析插件 - 集成深度分析功能
 * 功能：当未分析观察累积超过阈值时，自动触发分析技能
 */

const pluginConfig = {
    // 配置参数
    analysisThreshold: 2, // 触发分析的观察数量阈值
    analysisSkillId: 'data_insight_skill', // 分析技能ID
    memoryType: 'insight', // 记忆类型
    maxPendingObservations: 100, // 最大待处理观察数量
};

class ObservationAnalysisPlugin {
    constructor(options = {}) {
        this.config = { ...pluginConfig, ...options };
        
        // 状态管理
        this.pendingObservations = [];
        this.lastAnalysisTimestamp = null;
        this.isAnalyzing = false;
        
        // 依赖注入
        this.skillExecutor = options.skillExecutor || null;
        this.memoryStorage = options.memoryStorage || null;
        
        // 验证依赖
        this._validateDependencies();
    }

    _validateDependencies() {
        if (!this.skillExecutor) {
            throw new Error('skillExecutor dependency is required');
        }
        if (!this.memoryStorage) {
            throw new Error('memoryStorage dependency is required');
        }
    }

    /**
     * 核心处理函数 - 处理新观察
     * @param {Object} observation - 观察对象
     * @param {Object} context - 上下文信息
     */
    async processObservation(observation, context = {}) {
        try {
            // 1. 添加观察到待处理队列
            this._addToPendingQueue(observation, context);
            
            // 2. 检查是否达到分析阈值
            if (this._shouldTriggerAnalysis()) {
                await this._executeDeepAnalysis(context);
            }
            
            return {
                success: true,
                pendingCount: this.pendingObservations.length,
                analysisTriggered: this.pendingObservations.length >= this.config.analysisThreshold
            };
        } catch (error) {
            console.error('Error processing observation:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 将观察添加到待处理队列
     */
    _addToPendingQueue(observation, context) {
        const observationWithContext = {
            id: this._generateObservationId(),
            observation: observation,
            context: {
                cycleId: context.cycleId || 'unknown',
                timestamp: new Date().toISOString(),
                ...context
            },
            processed: false
        };
        
        this.pendingObservations.push(observationWithContext);
        
        // 保持队列大小限制
        if (this.pendingObservations.length > this.config.maxPendingObservations) {
            this.pendingObservations = this.pendingObservations.slice(-this.config.maxPendingObservations);
        }
    }

    /**
     * 生成观察ID
     */
    _generateObservationId() {
        return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 检查是否应该触发分析
     */
    _shouldTriggerAnalysis() {
        return (
            this.pendingObservations.length >= this.config.analysisThreshold &&
            !this.isAnalyzing
        );
    }

    /**
     * 执行深度分析
     */
    async _executeDeepAnalysis(context) {
        if (this.isAnalyzing) return;
        
        this.isAnalyzing = true;
        
        try {
            // 1. 准备分析上下文
            const analysisContext = this._prepareAnalysisContext(context);
            
            // 2. 调用分析技能
            const analysisResult = await this._invokeAnalysisSkill(analysisContext);
            
            // 3. 格式化并存储见解
            await this._storeAnalysisInsight(analysisResult, analysisContext);
            
            // 4. 重置状态
            this._resetAnalysisState();
            
            return analysisResult;
        } catch (error) {
            console.error('Deep analysis failed:', error);
            this.isAnalyzing = false;
            throw error;
        }
    }

    /**
     * 准备分析上下文
     */
    _prepareAnalysisContext(context) {
        // 提取观察数据
        const observationsToAnalyze = this.pendingObservations
            .slice(0, this.config.analysisThreshold)
            .map(item => ({
                content: item.observation,
                timestamp: item.context.timestamp,
                cycleId: item.context.cycleId
            }));
        
        return {
            observations: observationsToAnalyze,
            cycleId: context.cycleId,
            analysisType: 'pattern_recognition', // 模式识别
            timestamp: new Date().toISOString(),
            pendingCount: this.pendingObservations.length,
            threshold: this.config.analysisThreshold
        };
    }

    /**
     * 调用分析技能
     */
    async _invokeAnalysisSkill(analysisContext) {
        if (!this.skillExecutor) {
            throw new Error('Skill executor not available');
        }
        
        // 调用指定的分析技能
        const result = await this.skillExecutor.executeSkill(
            this.config.analysisSkillId,
            {
                input: analysisContext,
                params: {
                    analysisDepth: 'deep',
                    outputFormat: 'structured',
                    includeTrends: true,
                    includePatterns: true,
                    includeDiagnosis: true
                }
            }
        );
        
        return result;
    }

    /**
     * 格式化分析见解
     */
    _formatInsight(analysisResult, context) {
        return {
            id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: this.config.memoryType,
            content: {