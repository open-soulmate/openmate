/**
 * strategy_behavior_matcher.js
 * 策略-行为匹配度监控技能
 * 用于解决策略声明激进但行为保守的认知不协调问题
 */

const fs = require('fs');
const path = require('path');

class StrategyBehaviorMatcher {
    constructor() {
        this.name = 'strategy_behavior_matcher';
        this.description = '策略-行为匹配度监控技能';
        this.version = '1.0.0';
        this.cycleInterval = 3; // 每3个cycle执行一次
        this.matchThreshold = 60; // 匹配度阈值
        this.taskSuggestions = [
            '分析一个从未使用过的MCP工具描述',
            '尝试为现有技能编写一个备选实现',
            '研究一个与当前问题相关的新技术概念',
            '在代码库中搜索并应用一个新的设计模式',
            '尝试使用不同的算法解决已解决的问题',
            '将一个复杂的函数重构为更小的单元',
            '探索系统配置中未使用的功能选项',
            '为现有的API添加一个新的端点或方法'
        ];
    }

    /**
     * 获取策略声明源
     * @returns {Object} 策略声明数据
     */
    getStrategyDeclaration() {
        try {
            // 尝试从配置文件读取
            const configPath = path.join(__dirname, '../config/current_config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.current_strategy) {
                    return {
                        source: 'config',
                        strategy: config.current_strategy,
                        keywords: this.extractKeywords(config.current_strategy)
                    };
                }
            }

            // 如果配置文件没有，尝试从历史指令中提取
            const historyPath = path.join(__dirname, '../logs/instruction_history.json');
            if (fs.existsSync(historyPath)) {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                const recentInstructions = history.slice(-10); // 取最近10条指令
                const keywords = this.extractStrategyKeywords(recentInstructions);
                if (keywords.length > 0) {
                    return {
                        source: 'history',
                        strategy: keywords.join(', '),
                        keywords: keywords
                    };
                }
            }

            // 默认策略
            return {
                source: 'default',
                strategy: 'balanced exploration',
                keywords: ['平衡', '探索', '优化']
            };
        } catch (error) {
            console.error('获取策略声明失败:', error);
            return {
                source: 'error',
                strategy: 'unknown',
                keywords: []
            };
        }
    }

    /**
     * 从文本中提取策略关键词
     * @param {string} text 策略文本
     * @returns {Array} 关键词列表
     */
    extractKeywords(text) {
        const strategyKeywords = [
            '大胆尝试', '高探索', '探索', '创新', '风险', '激进',
            '保守', '稳定', '安全', '平衡', '优化', '改进',
            '突破', '实验', '尝试', '冒险', '进取'
        ];
        
        return strategyKeywords.filter(keyword => 
            text.includes(keyword)
        );
    }

    /**
     * 从历史指令中提取策略关键词
     * @param {Array} instructions 指令历史