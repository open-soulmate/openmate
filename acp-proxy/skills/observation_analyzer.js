const EventEmitter = require('events');
const winston = require('winston');

// 配置日志记录器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'observation-analyzer.log' }),
    new winston.transports.Console()
  ]
});

// 知识库存储类（可扩展为数据库或文件系统）
class KnowledgeBase {
  constructor() {
    this.observations = [];
    this.patterns = {
      preferences: [],
      taskPatterns: [],
      successStrategies: [],
      errorPatterns: []
    };
    this.lastAnalyzedTime = null;
    this.analyzedCount = 0;
  }

  addPattern(type, pattern) {
    if (this.patterns[type]) {
      // 避免重复添加
      const exists = this.patterns[type].some(p => 
        p.key === pattern.key && p.value === pattern.value
      );
      if (!exists) {
        this.patterns[type].push({
          ...pattern,
          timestamp: new Date().toISOString(),
          confidence: pattern.confidence || 0.8
        });
        logger.info(`Added new pattern to ${type}:`, pattern);
      }
    }
  }

  updateLastAnalyzed() {
    this.lastAnalyzedTime = new Date().toISOString();
    this.analyzedCount++;
  }

  getStats() {
    return {
      lastAnalyzedTime: this.lastAnalyzedTime,
      analyzedCount: this.analyzedCount,
      totalPatterns: Object.values(this.patterns).flat().length
    };
  }
}

// 观察分析器主类
class ObservationAnalyzer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.conversationHistory = [];
    this.observationsQueue = [];
    this.knowledgeBase = new KnowledgeBase();
    this.isRunning = false;
    this.conversationTurns = 0;
    
    // 配置选项
    this.config = {
      turnThreshold: options.turnThreshold || 5,
      timeThresholdMs: options.timeThresholdMs || 30000,
      maxHistoryLength: options.maxHistoryLength || 100,
      analysisWindowSize: options.analysisWindowSize || 10,
      ...options
    };
    
    this.setupTimers();
    this.setupEventHandlers();
    
    logger.info('ObservationAnalyzer initialized', {
      config: this.config
    });
  }

  setupTimers() {
    // 轮次计数器
    this.turnCounter = 0;
    
    // 定时分析器
    this.analysisTimer = null;
    
    // 启动定时分析
    this.startTimerAnalysis();
  }

  setupEventHandlers() {
    // 监听新对话轮次
    this.on('newTurn', (turnData) => {
      this.handleNewTurn(turnData);
    });

    // 监听新观察事件
    this.on('newObservation', (observation) => {
      this.addObservation(observation);
    });

    // 监听分析完成事件
    this.on('analysisComplete', (results) => {
      this.handleAnalysisResults(results);
    });
  }

  startTimerAnalysis() {
    if (this.config.timeThresholdMs > 0) {
      this.analysisTimer = setInterval(() => {
        this.performAnalysis('timer');
      }, this.config.timeThresholdMs);
      
      logger.info(`Timer analysis started with interval: ${this.config.timeThresholdMs}ms`);
    }
  }

  stopTimerAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
      logger.info('Timer analysis stopped');
    }
  }

  handleNewTurn(turnData) {
    this.conversationTurns++;
    this.conversationHistory.push({
      ...turnData,
      turnNumber: this.conversationTurns,
      timestamp: new Date().toISOString()
    });

    // 维护历史长度
    if (this.conversationHistory.length > this.config.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.config.maxHistoryLength);
    }

    // 检查是否达到轮次阈值
    if (this.conversationTurns % this.config.turnThreshold === 0) {
      logger.info(`Turn threshold reached: ${this.conversationTurns}`);
      this.performAnalysis('turns');
    }
  }

  addObservation(observation) {
    const observationEntry = {
      ...observation,
      timestamp: new Date().toISOString(),
      processed: false
    };
    
    this.observationsQueue.push(observationEntry);
    logger.info('New observation added to queue', { 
      observationId: observation.id,
      queueLength: this.observationsQueue.length 
    });
  }

  async performAnalysis(triggerType = 'manual') {
    if (this.isRunning) {
      logger.warn('Analysis already in progress, skipping');
      return null;
    }

    this.isRunning = true;
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`Starting analysis ${analysisId}`, {
      trigger: triggerType,
      queueLength: this.observationsQueue.length,
      historyLength: this.conversationHistory.length
    });

    try {
      const results = await this.analyzeObservations();
      
      // 标记分析完成
      this.isRunning = false;
      this.knowledgeBase.updateLastAnalyzed();
      
      // 发出分析完成事件
      this.emit('analysisComplete', {
        analysisId,
        triggerType,
        results,
        timestamp: new Date().toISOString()
      });

      logger.info(`Analysis ${analysisId} completed successfully`, {
        patternsFound: Object.values(this.knowledgeBase.patterns).flat().length
      });

      return results;
    } catch (error) {
      logger.error(`Analysis ${analysisId} failed`, { error: error.message });
      this.isRunning = false;
      
      // 错误处理：确保不会中断主对话流
      this.emit('analysisError', {
        analysisId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return null;
    }
  }

  async analyzeObservations() {