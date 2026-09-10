'use strict';

const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 核心技能：分析未处理的观察记录
 * 用于打破“进化循环停滞”，建立“观察-分析-行动”闭环
 */
class AnalyzeObservationsSkill {
    constructor() {
        this.name = 'analyze-observations-skill';
        this.description = '分析未处理的观察记录并生成结构化报告';
    }

    /**
     * 技能入口函数
     * @returns {Promise<Object>} 操作结果
     */
    async execute() {
        const startTime = Date.now();
        const result = {
            success: false,
            processed_observations: 0,
            created_reports: 0,
            report_ids: [],
            errors: [],
            execution_time: 0,
            statistics: {}
        };

        try {
            console.log(`[${this.name}] 开始执行分析流程...`);

            // 步骤1：获取未分析的观察记录
            const unanalyzedObservations = await this._getUnanalyzedObservations();
            
            if (unanalyzedObservations.length === 0) {
                console.log(`[${this.name}] 没有发现未分析的观察记录`);
                result.success = true;
                result.execution_time = Date.now() - startTime;
                return result;
            }

            console.log(`[${this.name}] 发现 ${unanalyzedObservations.length} 条未分析的观察记录`);

            // 步骤2：生成统计信息
            result.statistics = this._generateStatistics(unanalyzedObservations);

            // 步骤3：分析每条观察记录
            for (const observation of unanalyzedObservations) {
                try {
                    const analysis = await this._analyzeObservation(observation);
                    
                    // 步骤4：更新观察记录状态
                    await this._updateObservationStatus(observation.id, 'analyzed', analysis.summary);
                    
                    // 步骤5：将分析结果添加到报告
                    result.report_ids.push(analysis.report_id);
                    result.processed_observations++;
                    
                } catch (error) {
                    const errorMsg = `分析观察记录 ${observation.id} 时出错: ${error.message}`;
                    console.error(`[${this.name}] ${errorMsg}`);
                    result.errors.push({
                        observation_id: observation.id,
                        error: errorMsg,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // 步骤6：生成综合分析报告
            if (result.processed_observations > 0) {
                const consolidatedReport = await this._generateConsolidatedReport(
                    unanalyzedObservations.filter(obs => !result.errors.find(err => err.observation_id === obs.id))
                );
                
                if (consolidatedReport) {
                    result.report_ids.push(consolidatedReport.id);
                    result.created_reports = result.report_ids.length;
                }
            }

            result.success = true;
            result.execution_time = Date.now() - startTime;
            
            console.log(`[${this.name}] 分析流程完成。处理了 ${result.processed_observations} 条观察记录，生成了 ${result.created_reports} 份报告`);
            
            return result;

        } catch (error) {
            const errorMsg = `分析流程执行失败: ${error.message}`;
            console.error(`[${this.name}] ${errorMsg}`);
            result.errors.push({
                error: errorMsg,
                timestamp: new Date().toISOString()
            });
            result.execution_time = Date.now() - startTime;
            return result;
        }
    }

    /**
     * 获取未分析的观察记录
     * @returns {Promise<Array>} 未分析的观察记录数组
     */
    async _getUnanalyzedObservations() {
        try {
            return await memoryPlugin.get_observations({ status: 'unanalyzed' });
        } catch (error) {
            throw new Error(`获取未分析观察记录失败: ${error.message}`);
        }
    }

    /**
     * 分析单条观察记录
     * @param {Object} observation 观察记录对象
     * @returns {Promise<Object>} 分析结果
     */
    async _analyzeObservation(observation) {
        try {
            // 模式识别：识别观察记录中的关键信息
            const patterns = this._identifyPatterns(observation.content);
            
            // 关联进化目标
            const relatedGoals = this._associateGoals(patterns, observation.type);
            
            // 生成改进建议
            const suggestedActions = this._generateSuggestedActions(patterns, relatedGoals);
            
            // 创建分析报告
            const report = await this._createAnalysisReport(observation, patterns, relatedGoals, suggestedActions);
            
            return {
                observation_id: observation.id,
                report_id: report.id,
                summary: this._generateAnalysisSummary(patterns, relatedGoals, suggestedActions)
            };
            
        } catch (error) {
            throw new Error(`分析观察记录失败: ${error.message}`);
        }
    }

    /**
     * 识别观察记录中的模式
     * @param {string} content 观察内容
     * @returns {Array} 识别出的模式数组
     */
    _identifyPatterns(content) {
        const patterns = [];
        
        // 简单的模式识别逻辑