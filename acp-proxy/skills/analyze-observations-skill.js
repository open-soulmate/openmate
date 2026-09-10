'use strict';

const logger = require('../utils/logger');

/**
 * 观察分析技能 - 分析记忆库中未分析的观察记录
 * 
 * 核心技能：自动分析状态为 'unanalyzed' 的观察记录，
 * 生成结构化的分析结论和行动建议，建立观察-分析-行动闭环。
 */
class AnalyzeObservationsSkill {
    constructor() {
        this.name = 'analyze-observations-skill';
        this.description = '分析未观察的记录，生成结构化分析和行动建议';
        this.version = '1.0.0';
        this.dependencies = ['memory-plugin'];
        
        // 简单的统计分析工具 - 第一个内联的微小工具创造
        this.typeDistribution = {};
    }

    /**
     * 技能执行主入口
     * @returns {Promise<Object>} 操作结果
     */
    async execute() {
        const startTime = Date.now();
        const result = {
            success: false,
            analyzedCount: 0,
            reportId: null,
            errors: [],
            executionTime: 0,
            timestamp: new Date().toISOString()
        };

        try {
            logger.info(`[analyze-observations] 开始执行分析技能`);

            // 1. 获取记忆插件实例
            const memoryPlugin = this.getMemoryPlugin();
            if (!memoryPlugin) {
                throw new Error('无法获取记忆插件实例');
            }

            // 2. 获取未分析的观察记录
            const unanalyzedObservations = await this.fetchUnanalyzedObservations(memoryPlugin);
            logger.info(`[analyze-observations] 找到 ${unanalyzedObservations.length} 条未分析的观察记录`);

            if (unanalyzedObservations.length === 0) {
                result.success = true;
                result.analyzedCount = 0;
                result.message = '没有需要分析的观察记录';
                return result;
            }

            // 3. 分析每条观察记录
            const analysisResults = await this.analyzeObservations(unanalyzedObservations);
            
            // 4. 更新观察记录状态
            await this.updateObservationStatuses(memoryPlugin, analysisResults);

            // 5. 生成分析报告
            const reportId = await this.generateAnalysisReport(memoryPlugin, analysisResults);
            result.reportId = reportId;

            // 6. 生成操作结果
            result.success = true;
            result.analyzedCount = unanalyzedObservations.length;
            result.executionTime = Date.now() - startTime;
            
            logger.info(`[analyze-observations] 分析完成，已处理 ${result.analyzedCount} 条记录，报告ID: ${result.reportId}`);

        } catch (error) {
            logger.error(`[analyze-observations] 技能执行失败: ${error.message}`, error);
            result.success = false;
            result.errors.push({
                type: 'execution_error',
                message: error.message,
                stack: error.stack
            });
            result.executionTime = Date.now() - startTime;
        }

        return result;
    }

    /**
     * 获取记忆插件实例
     * @returns {Object|null} 记忆插件实例
     */
    getMemoryPlugin() {
        try {
            // 尝试从全局插件注册表获取
            if (global.acp && global.acp.plugins && global.acp.plugins.memoryPlugin) {
                return global.acp.plugins.memoryPlugin;
            }
            
            // 尝试动态导入
            const memoryPluginPath = require.resolve('../plugins/memory-plugin');
            return require(memoryPluginPath);
        } catch (error) {
            logger.error(`[analyze-observations] 获取记忆插件失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取未分析的观察记录
     * @param {Object} memoryPlugin 记忆插件实例
     * @returns {Promise<Array>} 未分析的观察记录数组
     */
    async fetchUnanalyzedObservations(memoryPlugin) {
        try {
            const observations = await memoryPlugin.get_observations({
                status: 'unanalyzed',
                limit: 100, // 限制每次分析的数量，避免资源消耗过大
                sort: { createdAt: 1 } // 按创建时间正序，先处理最早的
            });
            
            return Array.isArray(observations) ? observations : [];
        } catch (error) {
            logger.error(`[analyze-observations] 获取观察记录失败: ${error.message}`);
            throw new Error(`获取观察记录失败: ${error.message}`);
        }
    }

    /**
     * 分析观察记录
     * @param {Array} observations 观察记录数组
     * @returns {Promise<Array>} 分析结果数组
     */
    async analyzeObservations(observations) {
        const results = [];
        
        for (const observation of observations) {
            try {
                const analysis = await this.analyzeSingleObservation(observation);
                results.push({
                    observationId: observation.id,
                    analysis,
                    success: true
                });
                
                // 更新类型分布统计