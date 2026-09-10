// acp-proxy/skills/evolution-planner/index.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// 默认配置
const DEFAULT_CONFIG = {
  checkInterval: 30 * 60 * 1000, // 30分钟
  confirmationTimeout: 24 * 60 * 60 * 1000, // 24小时
  maxSubgoals: 10,
  knowledgeBasePath: 'knowledge/evolution-plans',
  plansPath: 'plans/pending',
  reportsPath: 'reports/evolution',
  enableAutoAnalysis: true,
  requireManualConfirmation: true
};

class EvolutionPlanner extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.skillName = 'evolution-planner';
    this.version = '1.0.0';
    this.isInitialized = false;
    this.isRunning = false;
    this.currentSessionId = null;
    
    // 集成其他技能
    this.skills = {
      self_introspect: null,
      observation_analyzer: null,
      code_executor: null
    };
    
    // 进度跟踪系统
    this.progressTracker = {
      goals: new Map(),
      history: [],
      metrics: {
        totalPlans: 0,
        confirmedPlans: 0,
        successRate: 0
      }
    };
    
    // 知识库
    this.knowledgeBase = {
      patterns: [],
      insights: [],
      lessonsLearned: []
    };
    
    // 定时器
    this.checkInterval = null;
    
    // 绑定方法
    this.analyzeProgress = this.analyzeProgress.bind(this);
    this.generateSubgoals = this.generateSubgoals.bind(this);
    this.createActionPlan = this.createActionPlan.bind(this);
    this.savePlan = this.savePlan.bind(this);
    this.requestConfirmation = this.requestConfirmation.bind(this);
    this.executeConfirmedPlan = this.executeConfirmedPlan.bind(this);
    this.generateProgressReport = this.generateProgressReport.bind(this);
    this.handleObservations = this.handleObservations.bind(this);
    this.recordToKnowledgeBase = this.recordToKnowledgeBase.bind(this);
  }

  async initialize(skillRegistry) {
    try {
      console.log(`[${this.skillName}] 初始化自我进化规划器...`);
      
      // 加载技能依赖
      await this.loadDependencies(skillRegistry);
      
      // 初始化目录结构
      await this.initializeDirectories();
      
      // 加载历史数据
      await this.loadProgressData();
      await this.loadKnowledgeBase();
      
      // 设置观察分析器集成
      if (this.config.enableAutoAnalysis) {
        this.setupObservationHandler();
      }
      
      // 设置定期检查
      this.startPeriodicCheck();
      
      this.isInitialized = true;
      this.currentSessionId = this.generateSessionId();
      
      console.log(`[${this.skillName}] 初始化完成，会话ID: ${this.currentSessionId}`);
      
      return {
        success: true,
        sessionId: this.currentSessionId,
        config: this.config
      };
    } catch (error) {
      console.error(`[${this.skillName}] 初始化失败:`, error);
      throw error;
    }
  }

  async loadDependencies(skillRegistry) {
    // 从技能注册表获取依赖的技能
    this.skills.self_introspect = skillRegistry.getSkill('self_introspect');
    this.skills.observation_analyzer = skillRegistry.getSkill('observation_analyzer');
    this.skills.code_executor = skillRegistry.getSkill('code_executor');
    
    if (!this.skills.self_introspect) {
      throw new Error('self_introspect技能未找到');
    }
    
    console.log(`[${this.skillName}] 依赖技能加载完成`);
  }

  async initializeDirectories() {
    const dirs = [
      this.config.knowledgeBasePath,
      this.config.plansPath,
      this.config.reportsPath,
      path.join(this.config.plansPath, 'confirmed'),
      path.join(this.config.plansPath, 'executed')
    ];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`[${this.skillName}] 创建目录: ${dir}`);
      }
    }
  }

  async loadProgressData() {
    const filePath = path.join(this.config.reportsPath, 'progress.json');
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      this.progressTracker = { ...this.progressTracker, ...parsed };
      console.log(`[${this.skillName}] 加载进度数据成功`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[${this.skillName}] 进度数据文件不存在，使用默认值`);
      } else {
        console.error(`[${this.skillName}] 加载进度数据失败:`, error);
      }
    }
  }

  async loadKnowledgeBase() {
    const filePath = path.join(this.config.knowledgeBasePath, 'knowledge.json');
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      this.knowledgeBase = { ...this.knowledgeBase, ...parsed };
      console.log(`[${this.skillName}] 加载知识库成功`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[${this.skillName}] 知识库文件不存在，使用默认值`);
      } else {
        console.error(`[${this.skillName}] 加载知识库失败:`, error);
      }
    }
  }

  setupObservationHandler() {
    if (this.skills.observation_analyzer) {
      this.skills.observation_analyzer.on('observations_unanalyzed', this.handleObservations);
      console.log(`[${this.skillName}] 观察分析器事件监听已设置`);
    }
  }

  startPeriodicCheck() {
    this.checkInterval = setInterval(async () => {
      if (this.isRunning) {