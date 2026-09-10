/**
 * Evolution Planner Skill
 * 自我进化规划技能 - 智能分析进化目标并生成可执行的改进计划
 * 
 * @module evolution-planner
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 进化规划器配置
 */
const DEFAULT_CONFIG = {
  // 规划频率（毫秒）
  planningInterval: 3600000, // 1小时
  // 确认等待超时时间（毫秒）
  confirmationTimeout: 86400000, // 24小时
  // 最大子目标数量
  maxSubGoalsPerTarget: 5,
  // 目标分解深度
  maxDecompositionDepth: 3,
  // 零进度阈值
  zeroProgressThreshold: 0,
  // 低进度阈值（百分比）
  lowProgressThreshold: 20,
  // 存储路径
  storagePath: './evolution-plans',
  knowledgePath: './knowledge/evolution',
  // 优先级权重
  priorityWeights: {
    selfProgramming: 1.0,
    toolCreation: 0.9,
    errorSelfRepair: 0.95,
    default: 0.7
  },
  // 安全级别
  safetyLevel: 'conservative', // conservative, moderate, aggressive
  // 自动触发观察分析的阈值
  unanalyzedObservationThreshold: 0
};

/**
 * 目标状态枚举
 */
const GoalStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PLANNED: 'planned',
  CONFIRMED: 'confirmed',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * 计划优先级枚举
 */
const PlanPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * 进化规划器主类
 */
class EvolutionPlanner {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.introspector - self_introspect实例
   * @param {Object} options.skillRegistry - 技能注册表
   * @param {Object} options.knowledgeBase - 知识库实例
   * @param {Object} options.logger - 日志实例
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.introspector = options.introspector || null;
    this.skillRegistry = options.skillRegistry || {};
    this.knowledgeBase = options.knowledgeBase || null;
    this.logger = options.logger || console;
    
    // 内部状态
    this.state = {
      isRunning: false,
      lastPlannedAt: null,
      pendingConfirmations: new Map(),
      activePlans: new Map(),
      goalProgress: new Map(),
      failurePatterns: new Map(),
      observations: [],
      evolutionHistory: []
    };
    
    // 定时器
    this._planningTimer = null;
    this._observationWatcher = null;
    
    // 绑定方法
    this._onObservationReceived = this._onObservationReceived.bind(this);
  }

  /**
   * 初始化规划器
   */
  async initialize() {
    this.logger.info('[EvolutionPlanner] Initializing evolution planner...');
    
    try {
      // 确保存储目录存在
      await this._ensureDirectories();
      
      // 加载现有状态
      await this._loadState();
      
      // 初始化与introspector的集成
      await this._initializeIntrospectorIntegration();
      
      // 启动定时规划
      this._startPlanningCycle();
      
      // 启动观察监听器
      this._startObservationWatcher();
      
      this.state.isRunning = true;
      this.logger.info('[EvolutionPlanner] Evolution planner initialized successfully');
      
      return { success: true, message: 'Evolution planner initialized' };
    } catch (error) {
      this.logger.error('[EvolutionPlanner] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 确保存储目录存在
   */
  async _ensureDirectories() {
    const directories = [
      this.config.storagePath,
      this.config.knowledgePath,
      path.join(this.config.storagePath, 'pending'),
      path.join(this.config.storagePath, 'confirmed'),
      path.join(this.config.storagePath, 'completed'),
      path.join(this.config.storagePath, 'reports')
    ];
    
    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }

  /**
   * 加载现有状态
   */
  async _loadState() {
    try {
      const statePath = path.join(this.config.storagePath, 'planner-state.json');
      const stateData = await fs.readFile(statePath, 'utf-8');
      const savedState = JSON.parse(stateData);
      
      // 恢复状态
      this.state.goalProgress = new Map(savedState.goalProgress || []);
      this.state.failurePatterns = new Map(savedState.failurePatterns || []);
      this.state.evolutionHistory = savedState.evolutionHistory || [];
      this.state.lastPlannedAt = savedState.lastPlannedAt;
      
      this.logger.info('[EvolutionPlanner] State loaded from storage');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn('[EvolutionPlanner] Could not load state:', error.message);
      }
    }
  }

  /**
   * 保存状态到存储
   */
  async _saveState() {
    const statePath = path.join(this.config.storagePath, 'planner-state.json');
    const stateData = {
      goalProgress: Array.from(this.state.goalProgress.entries()),
      failurePatterns: Array.from(this.state.failurePatterns.entries()),
      evolutionHistory: this.state.evolutionHistory,
      lastPlannedAt: this.state.lastPlannedAt,
      savedAt: new Date().toISOString()
    };
    
    await fs.writeFile(statePath, JSON.stringify(stateData, null, 2));
  }

  /**
   * 初始化与introspector的集成
   */
  async _initializeIntrospectorIntegration() {
    if (!this.introspector) {
      this.logger.warn('[EvolutionPlanner] No introspector provided, running in standalone mode');
      return;
    }
    
    // 注册为introspector的观察者
    if (typeof this.introspector.addObserver === 'function') {
      this.introspector.addObserver('evolution-planner', {
        onObservation: this._onObservationReceived,
        onGoalUpdate: this._onGoalUpdate.bind(this),
        onFailurePattern: this._onFailurePattern.bind(this)
      });
    }
    
    // 获取当前自省数据
    await this._syncWithIntrospector();
  }

  /**
   * 与introspector同步数据
   */
  async _syncWithIntrospector() {
    if (!this.introspector) return;
    
    try {
      // 获取进化目标
      const goals = await this.introspector.getEvolutionGoals?.() || [];
      goals.forEach(goal => {
        if (!this.state.goalProgress.has(goal.id)) {
          this.state.goalProgress.set(goal.id, {
            ...goal,
            lastChecked: new Date().toISOString(),
            subGoals: []
          });
        }
      });
      
      // 获取失败模式
      const patterns = await this.introspector.getFailurePatterns?.() || [];
      patterns.forEach(pattern => {
        this.state.failurePatterns.set(pattern.id, pattern);