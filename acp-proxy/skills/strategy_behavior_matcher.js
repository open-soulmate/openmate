/**
 * 策略-行为匹配度监控技能
 * 用于解决策略声明与实际行为不协调的认知不协调问题
 */

const fs = require('fs');
const path = require('path');

class StrategyBehaviorMatcher {
    constructor(config = {}) {
        // 技能配置
        this.skillName = 'StrategyBehaviorMatcher';
        this.description = '策略-行为匹配度监控技能';
        this.version = '1.0.0';
        
        // 关键配置参数
        this.cycle_interval = config.cycle_interval || 3; // 每3个cycle执行一次
        this.threshold = config.threshold || 60; // 匹配度阈值
        this.current_cycle = config.current_cycle || 0;
        
        // 数据源配置
        this.strategy_keywords = [
            '大胆尝试', '高探索', '积极探索', '主动尝试', '创新', '实验',
            '冒险', '突破', '革新', '试验', '开拓', '实验性', '试错'
        ];
        
        // 探索性任务库
        this.exploration_tasks = [
            '分析一个从未使用过的MCP工具描述，理解其功能和适用场景',
            '尝试为现有技能编写一个备选实现方案',
            '研究一个与当前问题相关的新技术概念或方法论',
            '使用一个新的数据处理库重新实现一个现有功能',
            '尝试用不同的算法策略优化一个已知问题',
            '探索一个未尝试过的调试或监控工具',
            '研究一个相关的开源项目或技术文档',
            '尝试将两个现有技能组合创建一个新功能',
            '使用不同的参数配置测试一个现有技能的效果',
            '探索一个跨领域的技术解决方案'
        ];
        
        // 历史记录
        this.match_history = [];
    }

    /**
     * 技能主入口
     * @param {Object} context - 执行上下文，包含进化日志、配置等
     * @returns {Object} 执行结果
     */
    async execute(context) {
        try {
            this.current_cycle = context.current_cycle || this.current_cycle + 1;
            
            // 检查是否到了执行周期
            if (!this._shouldExecute(this.current_cycle)) {
                return {
                    status: 'skipped',
                    message: `当前cycle ${this.current_cycle}，未到达执行周期（每${this.cycle_interval}个cycle）`
                };
            }

            console.log(`[${this.skillName}] 开始执行策略-行为匹配度分析 (Cycle: ${this.current_cycle})`);

            // 1. 提取策略声明
            const strategyDeclaration = await this._extractStrategyDeclaration(context);
            
            // 2. 收集行为数据
            const behaviorData = await this._collectBehaviorData(context);
            
            // 3. 计算匹配度分数
            const matchResult = this._calculateMatchScore(strategyDeclaration, behaviorData);
            
            // 4. 生成任务建议（如果需要）
            let taskSuggestions = [];
            if (matchResult.score < this.threshold) {
                taskSuggestions = this._generateTaskSuggestions(matchResult);
            }
            
            // 5. 生成报告
            const report = this._generateReport(
                strategyDeclaration, 
                behaviorData, 
                matchResult, 
                taskSuggestions
            );
            
            // 6. 保存历史记录
            this._saveToHistory(report);
            
            // 7. 输出到控制台/日志
            this._logReport(report);
            
            return {
                status: 'completed',
                cycle: this.current_cycle,
                match_score: matchResult.score,
                needs_attention: matchResult.score < this.threshold,
                report: report,
                suggestions: taskSuggestions,
                next_execution_cycle: this.current_cycle + this.cycle_interval
            };
            
        } catch (error) {
            console.error(`[${this.skillName}] 执行错误:`, error);
            return {
                status: 'error',
                message: error.message
            };
        }
    }

    /**
     * 检查是否应该在当前cycle执行
     */
    _shouldExecute(cycle) {
        return cycle % this.cycle_interval === 0 || cycle === 1;
    }

    /**
     * 提取策略声明关键词
     */
    async _extractStrategyDeclaration(context) {
        let strategyText = '';
        let foundKeywords = [];
        
        // 数据源1: 从配置文件读取 current_strategy 字段
        if (context.config && context.config.current_strategy) {
            strategyText = context.config.current_strategy;
        }
        
        // 数据源2: 从历史用户指令中提取策略关键词
        if (context.user_instructions && Array.isArray(context.user_instructions)) {
            const recentInstructions = context.user_instructions.slice(-10); // 最近10条指令
            strategyText += ' ' + recentInstructions.join(' ');
        }
        
        // 从历史进化日志中提取策略关键词
        if (context.evolution_logs) {
            const recentLogs = Array.isArray(context.evolution_logs) 
                ? context.evolution_logs.slice(-20) 
                : [];
            strategyText += ' ' + recentLogs.map(log => log.content || log.description || '').join(' ');
        }
        
        // 识别匹配的策略关键词
        foundKeywords = this.strategy_keywords.filter(keyword => 
            strategyText.includes(keyword)
        );
        
        // 如果没有明确的策略关键词，使用默认分析
        if (foundKeywords.length === 0) {
            foundKeywords = this._inferStrategyFromContext(context);
        }
        
        return {
            raw_text: strategyText,
            keywords: [...new Set(foundKeywords)], // 去重
            strategy_type: this._classifyStrategyType(foundKeywords)
        };
    }

    /**
     * 从上下文推断策略类型
     */
    _inferStrategyFromContext(context) {
        const inferred = [];
        
        // 检查配置中的策略倾向
        if (context.config) {
            const configStr = JSON.stringify(context.config);
            if (configStr.includes('explore') || configStr.includes('创新')) {
                inferred.push('探索');
            }
            if (configStr.includes('aggressive') || configStr.includes('大胆')) {
                inferred.push('大胆');
            }
            if (configStr.includes('try') || configStr.includes('尝试')) {
                inferred.push('尝试');
            }
        }
        
        return inferred.length > 0 ? inferred : ['保守']; // 默认保守策略
    }

    /**
     * 分类策略类型
     */
    _classifyStrategyType(keywords) {
        const aggressiveKeywords = ['大胆尝试', '高探索', '冒险', '突破', '革新'];
        const moderateKeywords = ['积极探索', '主动尝试', '创新', '实验'];
        const conservativeKeywords = ['保守', '稳健', '谨慎'];
        
        const hasAggressive = keywords.some(k => aggressiveKeywords.includes(k));
        const hasModerate = keywords.some(k => moderateKeywords.includes(k));
        
        if (hasAggressive) return 'aggressive';
        if (hasModerate) return 'moderate';
        return 'conservative';
    }

    /**
     * 收集行为数据
     */
    async _collectBehaviorData(context) {
        const behaviorData = {
            autonomous_execution_ratio: 0,
            new_tools_used_count: 0,
            exploration_actions: 0,
            total_actions: 0,
            successful_explorations: 0,
            // 额外行为指标
            repeated_patterns: 0,
            risk_taking_actions: 0
        };
        
        if (!context.evolution_logs) {
            return behaviorData;
        }
        
        const logs = Array.isArray(context.evolution_logs) ? context.evolution_logs : [];
        
        // 计算各项行为指标
        logs.forEach(log => {
            behaviorData.total_actions++;
            
            // 计算自主执行比例（需要autonomous-executor插件的日志格式）