'use strict';

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// 配置常量
const DEFAULT_CONFIG = {
  planningInterval: 24 * 60 * 60 * 1000, // 24小时
  confirmationTimeout: 48 * 60 * 60 * 1000, // 48小时
  maxSubGoals: 10,
  knowledgeBasePath: './knowledge/evolution-plans.json',
  plansDir: './evolution-plans',
  progressDir: './progress-reports',
  observationAnalyzer: null, // 将注入
  selfIntrospect: null, // 将注入
  skillRegistry: null // 将注入
};

class EvolutionPlanner extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentGoals = [];
    this.plans = new Map();
    this.progressHistory = [];
    this.isPlanning = false;
    this.initialized = false;
    
    // 绑定方法
    this.checkProgress = this.checkProgress.bind(this);
    this.generatePlan = this.generatePlan.bind(this);
    this.confirmPlan = this.confirmPlan.bind(this);
    this.analyzeObservations = this.analyzeObservations.bind(this);
  }

  async initialize() {
    try {
      // 确保目录存在
      await this.ensureDirectories();
      
      // 加载现有计划和进度
      await this.loadExistingData();
      
      // 设置定时规划
      this.planningTimer = setInterval(this.checkProgress, this.config.planningInterval);
      
      // 监听观察分析事件
      if (this.config.observationAnalyzer) {
        this.config.observationAnalyzer.on('newObservations', this.analyzeObservations);
      }
      
      this.initialized = true;
      this.emit('initialized');
      return true;
    } catch (error) {
      this.emit('error', { type: 'initialization', error });
      return false;
    }
  }

  async ensureDirectories() {
    const dirs = [
      this.config.plansDir,
      this.config.progressDir,
      path.dirname(this.config.knowledgeBasePath)
    ];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }

  async loadExistingData() {
    try {
      // 加载知识库
      try {
        const knowledge = await fs.readFile(this.config.knowledgeBasePath, 'utf8');
        const parsed = JSON.parse(knowledge);
        this.currentGoals = parsed.currentGoals || [];
        this.progressHistory = parsed.progressHistory || [];
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // 文件不存在，初始化空数据
        await this.saveKnowledgeBase();
      }
      
      // 加载现有计划
      await this.loadExistingPlans();
    } catch (error) {
      this.emit('error', { type: 'dataLoading', error });
      throw error;
    }
  }

  async loadExistingPlans() {
    try {
      const files = await fs.readdir(this.config.plansDir);
      const planFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of planFiles) {
        try {
          const content = await fs.readFile(path.join(this.config.plansDir, file), 'utf8');
          const plan = JSON.parse(content);
          this.plans.set(plan.id, plan);
        } catch (error) {
          this.emit('error', { type: 'planLoading', file, error });
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async saveKnowledgeBase() {
    const knowledge = {
      currentGoals: this.currentGoals,
      progressHistory: this.progressHistory,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(
      this.config.knowledgeBasePath,
      JSON.stringify(knowledge, null, 2),
      'utf8'
    );
  }

  async checkProgress() {
    if (this.isPlanning || !this.initialized) return;
    
    this.isPlanning = true;
    this.emit('planningStarted');
    
    try {
      // 1. 收集当前目标状态
      const goalStatus = await this.collectGoalStatus();
      
      // 2. 分析失败模式，识别瓶颈
      const bottlenecks = this.identifyBottlenecks(goalStatus);
      
      // 3. 针对零进度目标生成改进计划
      for (const bottleneck of bottlenecks) {
        if (bottleneck.progress === 0) {
          await this.generatePlanForGoal(bottleneck);
        }
      }
      
      // 4. 更新进度历史
      this.updateProgressHistory(goalStatus);
      
      // 5. 生成进度报告
      await this.generateProgressReport(goalStatus);
      
      // 6. 检查未分析的观察
      await this.analyzeObservations();
      
      // 7. 保存知识库
      await this.saveKnowledgeBase();
      
      this.emit('planningCompleted', {
        bottlenecks: bottlenecks.length,
        plansGenerated: bottlenecks.filter(b => b.progress === 0).length
      });
      
    } catch (error) {
      this.emit('error', { type: 'planning', error });
    } finally {
      this.isPlanning = false;
    }
  }

  async collectGoalStatus() {
    // 通过self_introspect获取当前目标状态
    if (!this.config.selfIntrospect) {
      return this.currentGoals.map(goal => ({
        ...goal,
        progress: 0,
        lastChecked: new Date().toISOString()
      }));
    }
    
    try {
      const introspection = await this.config.selfIntrospect.analyze({
        focus: ['goals', 'progress', 'blockers'],
        detail: 'detailed'
      });
      
      return this.parseGoalStatus(introspection);
    } catch (error) {
      this.emit('error', { type: 'introspection', error });
      return [];
    }
  }

  parseGoalStatus(introspection) {
    // 解析introspection结果，提取目标状态
    const goals = [];
    
    if (introspection.goals) {
      for (const goal of introspection.goals) {
        const existingGoal = this.currentGoals.find(g => g.id === goal.id);
        
        goals.push({
          id: goal.id,
          name: goal.name,
          description: goal.description || existingGoal?.description,
          category: goal.category || existingGoal?.category || 'general',
          progress: goal.progress || 0,
          lastChecked: new Date().toISOString(),
          blockers: goal.blockers || [],
          observations: goal.observations || []
        });
      }
    }
    
    this.currentGoals = goals;
    return goals;
  }

  identifyBottlenecks(goalStatus) {
    return goalStatus.filter(goal => {
      // 识别零进度目标
      if (goal.progress === 0) return true;
      
      // 识别进度缓慢的目标（低于20%且运行超过7天）
      if (goal.progress < 20 && this.isGoalStagnant(goal)) return true;
      
      // 识别有大量blockers的目标
      if (goal.blockers && goal.blockers.length > 3) return true;
      
      return false;
    });