/**
 * observation-analyzer.js
 * 即时观察分析技能 - 自动处理新观察并消除积压
 */

class ObservationAnalyzerSkill {
    constructor(context) {
        this.context = context;
        this.maxAnalysisTime = 500; // 500ms性能限制
    }

    /**
     * 主执行函数 - 在每个进化周期开始时调用
     * @returns {Object} 状态报告 {analyzed_count, insights_generated, processing_time}
     */
    async execute() {
        const startTime = Date.now();
        const result = {
            analyzed_count: 0,
            insights_generated: 0,
            processing_time: 0,
            errors: []
        };

        try {
            // 步骤1：获取未分析观察队列
            const unanalyzedObservations = this._getUnanalyzedObservations();
            
            if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
                result.processing_time = Date.now() - startTime;
                return result;
            }

            // 步骤2：遍历并分析每个观察
            for (const observation of unanalyzedObservations) {
                // 检查时间限制
                if (Date.now() - startTime >= this.maxAnalysisTime) {
                    console.warn(`分析超时，已处理${result.analyzed_count}/${unanalyzedObservations.length}个观察`);
                    break;
                }

                try {
                    // 步骤3：分析观察生成洞察
                    const insights = await this._analyzeObservation(observation);
                    
                    // 步骤4：存储洞察到长期记忆
                    await this._storeInsights(observation.id, insights);
                    
                    result.analyzed_count++;
                    result.insights_generated += insights.length;
                    
                } catch (error) {
                    result.errors.push({
                        observation_id: observation.id,
                        error: error.message
                    });
                    console.error(`观察分析失败 ${observation.id}:`, error);
                }
            }

            // 步骤5：清空队列并更新时间戳
            this._clearAnalysisQueue();
            this._updateLastAnalysisTimestamp();

            result.processing_time = Date.now() - startTime;
            
            // 步骤6：性能警告
            if (result.processing_time > this.maxAnalysisTime) {
                console.warn(`分析耗时超出限制: ${result.processing_time}ms`);
            }

            return result;

        } catch (error) {
            console.error('观察分析器执行失败:', error);
            result.processing_time = Date.now() - startTime;
            result.errors.push({ general_error: error.message });
            return result;
        }
    }

    /**
     * 获取未分析观察队列
     * @returns {Array} 观察队列
     */
    _getUnanalyzedObservations() {
        const queue = this.context.observations_unanalyzed || [];
        return Array.isArray(queue) ? [...queue] : [];
    }

    /**
     * 分析单个观察并生成洞察
     * @param {Object} observation 观察对象
     * @returns {Array} 洞察数组
     */
    async _analyzeObservation(observation) {
        // 尝试调用现有的分析方法
        if (this.context.analyzeObservation) {
            const result = await this.context.analyzeObservation(observation);
            return this._convertToInsights(result, observation.id);
        }
        
        // 简化版分析逻辑（备用方案）
        return this._simplifiedAnalysis(observation);
    }

    /**
     * 简化版分析逻辑
     * @param {Object} observation 观察对象
     * @returns {Array} 洞察数组
     */
    _simplifiedAnalysis(observation) {
        const insights = [];
        
        // 模式识别洞察
        if (observation.pattern) {
            insights.push({
                insight_type: 'pattern_recognition',
                content: `识别到模式: ${observation.pattern}`,
                confidence_score: 0.7,
                metadata: {
                    source: 'simplified_analysis',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // 数据异常洞察
        if (observation.anomaly_score > 0.8) {
            insights.push({
                insight_type: 'anomaly_detection',
                content: `检测到数据异常，异常分数: ${observation.anomaly_score}`,
                confidence_score: 0.9,
                metadata: {
                    severity: 'high',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // 趋势洞察
        if (observation.trend) {
            insights.push({
                insight_type: 'trend_analysis',
                content: `发现趋势: ${observation.trend}`,
                confidence_score: 0.6,
                metadata: {
                    direction: observation.trend_direction || 'unknown',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // 如果没有特定洞察，创建通用洞察
        if (insights.length === 0) {
            insights.push({
                insight_type: 'observation_recorded',
                content: `观察 ${observation.id} 已记录分析`,