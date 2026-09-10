const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 自我进化规划技能
 * 负责制定和管理ACPC系统自我进化的策略和计划
 */
class EvolutionPlanner {
    constructor(config = {}) {
        this.config = {
            planningFrequency: 60 * 60 * 1000, // 默认1小时规划一次
            confirmationTimeout: 24 * 60 * 60 * 1000, // 确认超时时间24小时
            planOutputDir: './evolution_plans',
            knowledgeBasePath: './knowledge_base/evolution',
            maxSubGoals: 10,
            minSubGoalProgress: 0.05,
            ...config
        };
        
        this.currentPlans = new Map();
        this.knowledgeBase = [];
        this.goalProgress = new Map();
        this.failurePatterns = [];
        this.lastPlanningTime = 0;
        
        // 初始化
        this.initialize();
    }
    
    async initialize() {
        try {
            // 确保输出目录存在
            await fs.mkdir(this.config.planOutputDir, { recursive: true });
            await fs.mkdir(this.config.knowledgeBasePath, { recursive: true });
            
            // 加载历史数据
            await this.loadKnowledgeBase();
            await this.loadGoalProgress();
            
            console.log('EvolutionPlanner 初始化完成');
        } catch (error) {
            console.error('EvolutionPlanner 初始化失败:', error);
        }
    }
    
    /**
     * 执行进化规划
     * @param {Object} introspectionData 自省数据
     * @returns {Object} 规划结果
     */
    async planEvolution(introspectionData = {}) {
        try {
            // 1. 检查是否需要规划
            if (!this.shouldPlan()) {
                return { status: 'skipped', reason: '未到规划时间' };
            }
            
            // 2. 分析当前状态
            const analysis = await this.analyzeCurrentState(introspectionData);
            
            // 3. 识别瓶颈
            const bottlenecks = this.identifyBottlenecks(analysis);
            
            // 4. 生成改进计划
            const improvementPlan = await this.generateImprovementPlan(analysis, bottlenecks);
            
            // 5. 分解目标
            const decomposedGoals = this.decomposeGoals(improvementPlan);
            
            // 6. 保存计划
            const planId = await this.savePlan(decomposedGoals);
            
            // 7. 记录到知识库
            await this.recordToKnowledgeBase(analysis, improvementPlan, planId);
            
            // 8. 更新规划时间
            this.lastPlanningTime = Date.now();
            
            // 9. 生成可视化
            const roadmap = await this.generateRoadmap(decomposedGoals);
            
            return {
                status: 'success',
                planId,
                analysis,
                bottlenecks,
                improvementPlan,
                decomposedGoals,
                roadmap,
                needsConfirmation: true
            };
        } catch (error) {
            console.error('进化规划失败:', error);
            return { status: 'error', error: error.message };
        }
    }
    
    /**
     * 判断是否需要规划
     */
    shouldPlan() {
        const now = Date.now();
        return now - this.lastPlanningTime >= this.config.planningFrequency;
    }
    
    /**
     * 分析当前状态
     */
    async analyzeCurrentState(introspectionData) {
        const analysis = {
            timestamp: new Date().toISOString(),
            observations_unanalyzed: introspectionData.observations_unanalyzed || 0,
            goalProgress: {},
            systemHealth: {},
            performanceMetrics: {},
            recentFailures: [],
            ...introspectionData
        };
        
        // 检查未分析的观察
        if (analysis.observations_unanalyzed > 0) {
            console.log(`发现 ${analysis.observations_unanalyzed} 个未分析的观察，触发分析流程`);
            await this.triggerObservationAnalysis(analysis);
        }
        
        // 更新目标进度
        await this.updateGoalProgress(analysis);
        
        return analysis;
    }
    
    /**
     * 触发观察分析流程
     */
    async triggerObservationAnalysis(analysis) {
        try {
            // 这里应该调用观察分析器技能
            // 假设我们有一个analyzeObservations方法
            console.log('触发观察分析流程...');
            
            // 模拟调用其他技能
            if (this.skillSystem && this.skillSystem.hasSkill('observation-analyzer')) {