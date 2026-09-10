/**
 * 策略-行为匹配度监控技能
 * 解决策略声明激进但行为保守的认知不协调问题
 */
class StrategyBehaviorMatcher {
    constructor() {
        this.name = 'strategy-behavior-matcher';
        this.description = '策略-行为匹配度监控技能';
        this.cycleInterval = 3; // 每3个周期执行一次
        this.matchScoreThreshold = 60; // 匹配度阈值
        this.keywords = {
            aggressive: ['大胆尝试', '高探索', '创新', '突破', '激进', '冒险', '探索性'],
            conservative: ['保守', '稳健', '谨慎', '安全', '维持']
        };
        this.explorationTasks = [
            '分析一个从未使用过的MCP工具描述，并尝试理解其使用场景',
            '为现有技能编写一个备选实现方案，考虑不同的技术路径',
            '研究一个与当前问题相关的新技术概念，并评估其应用价值',
            '尝试创建一个简单的新技能原型，用于解决一个特定子问题',
            '分析系统日志，找出可以优化的性能瓶颈点',
            '尝试使用不同的编程范式重写一个现有功能',
            '研究一个相关的开源项目，学习其架构设计',
            '设计一个实验来验证某个假设或想法',
            '尝试将两个现有功能组合创建一个新的功能',
            '探索系统中未使用过的API或接口'
        ];
        this.lastExecutionCycle = 0;
    }

    /**
     * 检查是否应该执行技能
     * @param {number} currentCycle - 当前周期数
     * @returns {boolean}
     */
    shouldExecute(currentCycle) {
        return currentCycle - this.lastExecutionCycle >= this.cycleInterval;
    }

    /**
     * 从配置或历史指令中提取策略关键词
     * @param {Object} config - 配置对象
     * @param {Array} historicalInstructions - 历史指令列表
     * @returns {Object}
     */
    extractStrategy(config, historicalInstructions) {
        const strategy = {
            keywords: [],
            source: 'none',
            rawText: ''
        };

        // 从配置中提取
        if (config && config.current_strategy) {
            strategy.keywords = this.extractKeywordsFromText(config.current_strategy);
            strategy.source = 'config';
            strategy.rawText = config.current_strategy;
            return strategy;
        }

        // 从历史指令中提取
        if (historicalInstructions && historicalInstructions.length > 0) {
            const combinedText = historicalInstructions.join(' ');
            strategy.keywords = this.extractKeywordsFromText(combinedText);
            strategy.source = 'historical_instructions';
            strategy.rawText = combinedText;
        }

        return strategy;
    }

    /**
     * 从文本中提取关键词
     * @param {string} text - 输入文本
     * @returns {Array}
     */
    extractKeywordsFromText(text) {
        if (!text) return [];

        const allKeywords = [
            ...this.keywords.aggressive,
            ...this.keywords.conservative
        ];

        return allKeywords.filter(keyword => 
            text.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    /**
     * 分析进化日志获取行为数据
     * @param {Array} evolutionLogs - 进化日志列表
     * @returns {Object}
     */
    analyzeBehavior(evolutionLogs) {
        const behaviorData = {
            autonomous_execution_ratio: 0,
            new_tools_used_count: 0,
            exploration_actions: 0,
            period: evolutionLogs.length
        };

        if (!evolutionLogs || evolutionLogs.length === 0) {
            return behaviorData;
        }

        // 计算平均值
        let totalAutonomousRatio = 0;
        let totalNewToolsCount = 0;
        let totalExplorationActions = 0;

        evolutionLogs.forEach(log => {
            totalAutonomousRatio += log.autonomous_execution_ratio || 0;
            totalNewToolsCount += log.new_tools_used_count || 0;
            totalExplorationActions += log.exploration_actions || 0;
        });

        behaviorData.autonomous_execution_ratio = totalAutonomousRatio / evolutionLogs.length;