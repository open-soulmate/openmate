/**
 * Evolution Planner Skill
 * 自我进化规划技能 - 负责系统自我改进的规划和执行
 * 
 * @author MiMo Team
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

// ============================================================
// 配置常量
// ============================================================
const DEFAULT_CONFIG = {
  // 规划频率配置（毫秒）
  planningInterval: 30 * 60 * 1000, // 30分钟
  progressCheckInterval: 10 * 60 * 1000, // 10分钟
  
  // 确认流程配置
  confirmation: {
    requireManualApproval: true,
    approvalTimeoutMs: 24 * 60 * 60 * 1000, // 24小时
    maxPendingPlans: 10,
    autoApproveThreshold: 0, // 0表示不自动批准
  },
  
  // 目标分解配置
  decomposition: {
    maxSubGoalsPerGoal: 10,
    maxTaskDepth: 3,
    minTaskDurationMinutes: 5,
    maxTaskDurationMinutes: 480, // 8小时
  },
  
  // 进度阈值
  progressThresholds: {
    stalled: 0.1, // 进度低于10%视为停滞
    slow: 0.3,    // 进度低于30%视为缓慢
    onTrack: 0.6, // 进度高于60%视为正常
  },
  
  // 知识库路径
  paths: {
    knowledgeBase: 'data/evolution-knowledge',
    pendingPlans: 'data/evolution-plans/pending',
    approvedPlans: 'data/evolution-plans/approved',
    progressReports: 'data/evolution-reports',
    roadmapOutput: 'data/evolution-roadmap',
  },
  
  // 三个零进度目标的定义
  zeroProgressGoals: [
    {
      id: 'self_programming',
      name: '自编程能力',
      description: '系统能够自主编写、修改和优化代码',
      priority: 'critical',
      estimatedComplexity: 'high',
    },
    {
      id: 'tool_creation',
      name: '工具创造',
      description: '系统能够根据需求自动创建新工具',
      priority: 'high',
      estimatedComplexity: 'medium',
    },
    {
      id: 'error_self_repair',
      name: '错误自修复',
      description: '系统能够自动检测、诊断并修复错误',
      priority: 'high',
      estimatedComplexity: 'medium',
    },
  ],
};

// ============================================================
// 主类：EvolutionPlanner
// ============================================================
class EvolutionPlanner extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = this._mergeConfig(DEFAULT_CONFIG, options.config || {});
    this.isRunning = false;
    this.planningTimer = null;
    this.progressTimer = null;
    
    // 状态存储
    this.state = {
      currentGoals: new Map(),
      progressHistory: new Map(),
      failurePatterns: new Map(),
      pendingApprovals: new Map(),
      knowledge: [],
      lastPlanningTime: null,
      lastProgressCheck: null,
      observationsUnanalyzed: 0,
    };
    
    // 依赖注入
    this.introspect = options.introspect || null;
    this.logger = options.logger || console;
    this.storage = options.storage || null;
    this.observationAnalyzer = options.observationAnalyzer || null;
    
    // 绑定方法
    this._onObservationUnanalyzed = this._onObservationUnanalyzed.bind(this);
  }

  // ============================================================
  // 初始化方法
  // ============================================================
  
  /**
   * 初始化进化规划器
   */
  async initialize() {
    this.logger.info('[EvolutionPlanner] Initializing...');
    
    // 创建必要的目录
    await this._ensureDirectories();
    
    // 加载持久化状态
    await this._loadState();
    
    // 集成self_introspect功能
    await this._integrateIntrospection();
    
    // 集成观察分析器
    await this._integrateObservationAnalyzer();
    
    // 初始化零进度目标
    await this._initializeZeroProgressGoals();
    
    this.logger.info('[EvolutionPlanner] Initialized successfully');
    this.emit('initialized');
    
    return this;
  }

  /**
   * 确保所有必要目录存在
   */
  async _ensureDirectories() {
    const dirs = Object.values(this.config.paths);
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
    }
  }

  /**
   * 加载持久化状态
   */
  async _loadState() {
    try {
      const statePath = path.join(this.config.paths.knowledgeBase, 'evolution-state.json');
      const data = await fs.readFile(statePath, 'utf-8').catch(() => null);
      
      if (data) {
        const parsed = JSON.parse(data);
        this.state.currentGoals = new Map(parsed.currentGoals || []);
        this.state.progressHistory = new Map(parsed.progressHistory || []);
        this.state.failurePatterns = new Map(parsed.failurePatterns || []);
        this.state.knowledge = parsed.knowledge || [];
        this.state.lastPlanningTime = parsed.lastPlanningTime;
        this.state.lastProgressCheck = parsed.lastProgressCheck;
        this.logger.info('[EvolutionPlanner] State loaded from storage');
      }
    } catch (error) {
      this.logger.warn('[EvolutionPlanner] Could not load state:', error.message);
    }
  }

  /**
   * 保存状态到持久化存储
   */
  async _saveState() {
    try {
      const statePath = path.join(this.config.paths.knowledgeBase, 'evolution-state.json');
      const stateData = {
        currentGoals: Array.from(this.state.currentGoals.entries()),
        progressHistory: Array.from(this.state.progressHistory.entries()),
        failurePatterns: Array.from(this.state.failurePatterns.entries()),
        knowledge: this.state.knowledge,
        lastPlanningTime: this.state.lastPlanningTime,
        lastProgressCheck: this.state.lastProgressCheck,
        savedAt: new Date().toISOString(),
      };
      
      await fs.writeFile(statePath, JSON.stringify(stateData, null, 2));
    } catch (error) {
      this.logger.error('[EvolutionPlanner] Failed to save state:', error.message);
    }
  }

  /**
   * 集成self_introspect功能
   */
  async _integrateIntrospection() {
    if (!this.introspect) {
      this.logger.warn('[EvolutionPlanner] No introspect module provided, using mock');
      this.introspect = {
        getIntrospectionReport: async () => ({
          currentGoals: [],
          progress: {},
          failures: [],
          capabilities: [],
        }),
        analyzeSystemState: async () => ({}),
        getEvolutionHistory: async () => [],
      };
    }
    
    // 注册为introspect的监听器
    if (this.introspect.on) {
      this.introspect.on('introspection-complete', (data) => {
        this._processIntrospectionData(data);
      });
    }
    
    this.logger.info('[EvolutionPlanner] Introspection integration complete');
  }

  /**
   * 集成观察分析器
   */
  async _integrateObservationAnalyzer() {
    if (!this.observationAnalyzer) {
      this.logger.warn('[EvolutionPlanner] No observation analyzer provided');
      this.observationAnalyzer = {
        getUnanalyzedCount: async () => 0,
        analyzeObservations: async () => [],
        getObservationInsights: async () => [],
      };
    }
    
    this.logger.info('[EvolutionPlanner] Observation analyzer integration complete');
  }

  /**
   * 初始化零进度目标
   */
  async _initializeZeroProgressGoals() {
    for (const goalDef of this.config.zeroProgressGoals) {
      if (!this.state.currentGoals.has(goalDef.id)) {
        const goal = {
          ...goalDef,
          progress: 0,
          status: 'pending',
          subGoals: [],
          actionSteps: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [],
          blockers: [],
          dependencies: [],
        };
        this.state.currentGoals.set(goalDef.id, goal);
      }