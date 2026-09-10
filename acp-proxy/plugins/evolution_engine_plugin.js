/**
 * Evolution Engine Plugin
 * 增强进化引擎的规划一致性和自我执行能力
 * 
 * 修改版本：v2.0
 * 主要改进：
 * 1. 确保每次循环至少生成1项改进计划
 * 2. 提高"self"执行任务的比例，特别是自编程和工具创造相关任务
 * 3. 引入执行者选择算法，优化任务分配
 */

const logger = require('../utils/logger');
const config = require('../config/evolution_config');

class EvolutionEnginePlugin {
    constructor() {
        this.pluginName = 'evolution_engine_plugin';
        this.version = '2.0';
        this.taskExecutionFramework = require('../frameworks/task_executor');
        
        // 执行者选择权重配置
        this.executorWeights = {
            self: {
                'mcp_creation': 100,      // 自编程任务100%给self
                'self_repair': 100,       // 自我修复任务100%给self
                'skill_optimization': 80, // 技能优化任务80%给self
                'bug_fix': 70,            // 修复错误任务70%给self
                'code_optimization': 60,  // 代码优化任务60%给self
                'default': 50             // 其他任务50%给self
            },
            partner: {
                'default': 50             // 其他任务50%给partner
            }
        };
        
        // 历史失败模式分析
        this.failurePatterns = this._loadFailurePatterns();
    }
    
    /**
     * 生成进化计划
     * @param {Object} currentGoals - 当前目标状态
     * @param {Object} historicalData - 历史数据
     * @returns {Array} 进化计划数组
     */
    _generate_evolution_plan(currentGoals, historicalData) {
        try {
            logger.info(`[${this.pluginName}] 开始生成进化计划`);
            
            // 1. 生成原始计划
            let rawPlan = this._generateRawPlan(currentGoals, historicalData);
            
            // 2. 确保至少生成1项改进计划
            rawPlan = this._ensureMinimumImprovements(rawPlan, currentGoals, historicalData);
            
            // 3. 为每个任务分配执行者
            const finalPlan = this._assignExecutors(rawPlan, currentGoals);
            
            logger.info(`[${this.pluginName}] 进化计划生成完成，共${finalPlan.length}项任务`);
            return finalPlan;
            
        } catch (error) {
            logger.error(`[${this.pluginName}] 生成进化计划失败: ${error.message}`);
            // 失败时返回一个基础改进计划
            return [this._createFallbackPlan()];
        }
    }
    
    /**
     * 生成原始计划（基于现有逻辑）
     */
    _generateRawPlan(currentGoals, historicalData) {
        // 这里可以调用原有的计划生成逻辑
        // 由于我们不知道原有实现，这里用一个示例实现
        const plans = [];
        
        // 检查自编程能力目标
        if (this._shouldCreateMCPGoal(currentGoals)) {
            plans.push({
                type: 'mcp_creation',
                description: '创建新的MCP模块以提升自编程能力',
                priority: 'high',
                estimated_effort: 'medium'
            });
        }
        
        // 检查工具创造目标
        if (this._shouldCreateToolGoal(currentGoals)) {
            plans.push({
                type: 'tool_creation',
                description: '开发新的工具以扩展系统能力',
                priority: 'medium',
                estimated_effort: 'high'
            });
        }
        
        // 检查技能优化
        if (this._shouldOptimizeSkills(currentGoals)) {
            plans.push({
                type: 'skill_optimization',
                description: '优化现有技能以提高效率',
                priority: 'medium',
                estimated_effort: 'low'
            });
        }
        
        // 添加其他基于历史失败模式的任务
        plans.push(...this._addFailurePatternBasedTasks(historicalData));
        
        return plans;
    }
    
    /**
     * 确保至少生成1项改进计划
     * 解决历史中出现的"规划0项改进"问题
     */
    _ensureMinimumImprovements(rawPlan, currentGoals, historicalData) {
        // 如果已经至少有1项计划，直接返回
        if (rawPlan.length >= 1) {
            return rawPlan;
        }
        
        logger.warn(`[${this.pluginName}] 原始计划为空，生成基础改进计划`);
        
        // 根据当前目标进度和历史失败模式自动生成一项基础改进
        const basePlan = this._generateBaseImprovement(currentGoals, historicalData);
        
        return [basePlan];
    }
    
    /**
     * 生成基础改进计划
     * 当原始计划为空时自动调用
     */
    _generateBaseImprovement(currentGoals, historicalData) {
        // 根据目标类型选择基础改进
        const goalType = this._identifyPrimaryGoal(currentGoals);
        
        switch (goalType) {
            case 'self_programming':
                return {
                    type: 'mcp_creation',
                    description: '创建基础MCP模块以提升自编程能力',
                    priority: 'high',
                    estimated_effort: 'low',
                    auto_generated: true,
                    reason: '确保每次循环至少有1项改进计划'
                };
                
            case 'tool_creation':
                return {
                    type: 'tool_creation',
                    description: '创建基础工具以扩展系统能力',
                    priority: 'medium',
                    estimated_effort: 'low',
                    auto_generated: true,
                    reason: '确保每次循环至少有1项改进计划'
                };
                
            case 'optimization':
                return {
                    type: 'skill_optimization',
                    description: '优化一个现有技能',
                    priority: 'medium',
                    estimated_effort: 'low',
                    auto_generated: true,
                    reason: '确保每次循环至少有1项改进计划'
                };
                
            default:
                return {
                    type: 'observation',
                    description: '记录一条新观察以提升系统认知',
                    priority: 'low',
                    estimated_effort: 'low',
                    auto_generated: true,
                    reason: '确保每次循环至少有1项改进计划'
                };
        }
    }
    
    /**
     * 为任务分配执行者
     * 引入执行者选择算法，提高self执行比例
     */
    _assignExecutors(rawPlan, currentGoals) {
        return rawPlan.map(task => {
            const executor = this._selectExecutor(task, currentGoals);
            return {
                ...task,
                executor: executor,
                executor_selection_reason: this._getExecutorSelectionReason(task, executor)
            };
        });
    }
    
    /**
     * 选择执行者的算法
     * 根据任务类型和目标优先级分配执行者
     */
    _selectExecutor(task, currentGoals) {
        const taskType = task.type;
        
        // 强制指定的任务类型
        if (['mcp_creation', 'self_repair'].includes(taskType)) {
            return 'self';
        }
        
        // 根据权重选择执行者
        const selfWeight = this.executorWeights.self[taskType] || this.executorWeights.self.default;
        const randomValue = Math.random() * 100;
        
        // 考虑当前目标优先级，如果是关键目标，提高self权重
        let adjustedWeight = selfWeight;