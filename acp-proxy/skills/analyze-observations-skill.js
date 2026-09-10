/**
 * 观察分析技能 - 打破进化循环停滞的核心技能
 * 将未分析的观察记录转化为结构化分析结论和行动建议
 */

const { memoryPlugin } = require('../plugins/memory-plugin');
const { logger } = require('../utils/logger');
const { errorHandler } = require('../utils/error-handler');

class AnalyzeObservationsSkill {
    constructor() {
        this.name = 'analyze-observations-skill';
        this.version = '1.0.0';
        this.description = '分析未观察记录，生成结构化结论和行动建议';
        this.memoryPlugin = memoryPlugin;
        
        // 分析配置
        this.config = {
            maxBatchSize: 50, // 每次分析的最大记录数
            analysisTimeout: 30000, // 单条记录分析超时(ms)
            minObservationsForPattern: 3, // 模式识别的最小观察数
            analysisDepth: 3 // 分析深度级别(1-5)
        };
        
        // 进化目标映射
        this.evolutionGoals = {
            'error_pattern': '错误自修复',
            'performance_issue': '性能优化',
            'behavior_anomaly': '行为规范',
            'capability_gap': '能力扩展',
            'knowledge_update': '知识更新',
            'tool_creation': '工具创造'
        };
        
        // 统计分析工具（内联的微小工具创造实例）
        this.statisticsAnalyzer = this.createStatisticsAnalyzer();
    }

    /**
     * 创建简单的统计分析工具
     * @returns {Object} 统计分析工具实例
     */
    createStatisticsAnalyzer() {
        return {
            /**
             * 计算观察类型分布
             * @param {Array} observations - 观察记录数组
             * @returns {Object} 类型分布统计
             */
            calculateTypeDistribution(observations) {
                const distribution = {};
                const total = observations.length;
                
                observations.forEach(obs => {
                    const type = obs.type || 'unknown';
                    distribution[type] = (distribution[type] || 0) + 1;
                });
                
                // 转换为百分比
                Object.keys(distribution).forEach(key => {
                    distribution[key] = {
                        count: distribution[key],
                        percentage: (distribution[key] / total * 100).toFixed(2)
                    };
                });
                
                return {
                    distribution,
                    total,
                    dominantType: this.getDominantType(distribution)
                };
            },
            
            /**
             * 识别主导类型
             * @param {Object} distribution - 类型分布
             * @returns {string} 主导类型
             */
            getDominantType(distribution) {
                let maxCount = 0;
                let dominant = '';
                
                Object.keys(distribution).forEach(type => {
                    if (distribution[type].count > maxCount) {
                        maxCount = distribution[type].count;
                        dominant = type;
                    }
                });
                
                return dominant;
            },
            
            /**
             * 计算观察频率趋势
             * @param {Array} observations - 观察记录数组
             * @param {number} windowSize - 窗口大小
             * @returns {Object} 趋势分析结果
             */
            calculateFrequencyTrend(observations, windowSize = 5) {
                if (observations.length < windowSize * 2) {
                    return { trend: 'insufficient_data', direction: 'stable' };
                }
                
                // 按时间排序
                const sorted = [...observations].sort(
                    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
                );
                
                // 计算最近窗口和之前的窗口
                const recentWindow = sorted.slice(-windowSize);
                const previousWindow = sorted.slice(-windowSize * 2, -windowSize);
                
                const recentFreq = recentWindow.length / windowSize;
                const previousFreq = previousWindow.length / windowSize;
                
                const changeRatio = (recentFreq - previousFreq) / previousFreq;
                
                let direction = 'stable';
                if (changeRatio > 0.2) direction = 'increasing';
                else if (changeRatio < -0.2) direction = 'decreasing';
                
                return {
                    trend: changeRatio > 0.2 ? 'increasing' : 
                           changeRatio < -0.2 ? 'decreasing' : 'stable',
                    direction,
                    changeRatio: changeRatio.toFixed(4),
                    recentFrequency: recentFreq.toFixed(2),
                    previousFrequency: previousFreq.toFixed(2)
                };
            }
        };
    }

    /**
     * 执行观察分析技能
     * @returns {Promise<Object>} 操作结果
     */
    async execute() {