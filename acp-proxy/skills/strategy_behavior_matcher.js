const StrategyBehaviorMatcher = {
    metadata: {
        name: 'strategy-behavior-matcher',
        description: '策略-行为匹配度监控技能',
        version: '1.0.0',
        requiredModules: ['logger', 'scheduler', 'task-suggester'],
        executionInterval: 3 // 每3个cycle执行一次
    },

    // 探索性任务库
    explorationTaskLibrary: [
        '分析一个从未使用过的MCP工具描述，了解其功能和使用场景',
        '尝试为现有技能编写一个备选实现方案，比较两种实现的差异',
        '研究一个与当前问题相关的新技术概念，并记录学习笔记',
        '主动探索一个未知领域的问题，扩展知识边界',
        '尝试使用一种全新的方法来解决一个重复性问题',
        '分析系统日志中的异常模式，寻找优化机会',
        '设计一个小型实验来测试某个假设或想法',
        '模拟一种极端场景下的系统行为，评估鲁棒性'
    ],

    // 关键词配置
    strategyKeywords: {
        aggressive: ['大胆尝试', '高探索', '创新', '突破', '冒险', '激进'],
        conservative: ['保守', '稳定', '安全', '谨慎', '稳健']
    },

    // 行为数据源配置
    behaviorMetrics: {
        autonomous_execution_ratio: { weight: 0.4, threshold: 0.3 },
        new_tools_used_count: { weight: 0.3, threshold: 1 },
        exploration_actions: { weight: 0.3, threshold: 2 }
    },

    /**
     * 执行策略-行为匹配度分析
     * @param {Object} context - 运行上下文
     * @returns {Object} 匹配度报告和建议
     */
    async execute(context) {
        const { currentCycle, evolutionLogs, config, recentInstructions } = context;

        // 检查是否满足执行间隔条件
        if (currentCycle % this.metadata.executionInterval !== 0) {
            return null;
        }

        try {
            // 1. 获取策略声明源
            const strategySource = this.extractStrategy(config, recentInstructions);
            
            // 2. 获取行为数据源
            const behaviorData = this.extractBehaviorData(evolutionLogs);
            
            // 3. 计算匹配度分数
            const matchResult = this.calculateMatchScore(strategySource, behaviorData);
            
            // 4. 生成建议（如果需要）
            let suggestions = null;
            if (matchResult.score < 60) {
                suggestions = this.generateSuggestions();
            }
            
            // 5. 生成报告
            const report = {
                timestamp: new Date().toISOString(),
                cycle: currentCycle,