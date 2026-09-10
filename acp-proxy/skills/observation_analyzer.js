/**
 * 自主观察分析技能 - ObservationAnalyzer
 * 
 * 实现周期性扫描分析未处理观察，将其转化为结构化知识模式
 * 支持每5轮对话或每30秒触发分析，解决"Observations unanalyzed increased"问题
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class ObservationAnalyzer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            analysisInterval: 30000, // 30秒间隔（毫秒）
            turnThreshold: 5,       // 每5轮对话触发一次
            maxObservationHistory: 1000, // 保留的最大观察历史数量
            knowledgeBasePath: options.knowledgeBasePath || './data/observation_kb.json',
            ...options
        };
        
        this.state = {
            turnCounter: 0,
            lastAnalysisTime: Date.now(),
            observationQueue: [],
            knowledgeBase: {
                userPreferences: [],
                errorPatterns: [],
                successStrategies: [],
                taskPatterns: [],
                conversationPatterns: []
            },
            isAnalyzing: false,
            logs: []
        };
        
        this.timers = {
            periodic: null
        };
        
        this._setupTriggers();
    }
    
    /**
     * 设置触发器：对话轮次和定时器
     */
    _setupTriggers() {
        // 定时器触发器
        this.timers.periodic = setInterval(() => {
            this._triggerAnalysis('timer');
        }, this.options.analysisInterval);
        
        // 对话轮次触发器通过 incrementTurnCounter 方法实现
    }
    
    /**
     * 增加对话轮次计数器并检查是否触发分析
     * @param {object} conversationData - 对话数据
     */
    incrementTurnCounter(conversationData = {}) {
        this.state.turnCounter++;
        
        // 将观察添加到队列
        if (conversationData.observations) {
            this.addObservation(conversationData.observations);
        }
        
        // 检查是否达到轮次阈值
        if (this.state.turnCounter % this.options.turnThreshold === 0) {
            this._triggerAnalysis('turn_threshold');
        }
        
        return this.state.turnCounter;
    }
    
    /**
     * 添加观察到队列
     * @param {string|array} observations - 观察内容
     */
    addObservation(observations) {
        const newObservations = Array.isArray(observations) 
            ? observations 
            : [observations];
        
        const timestamp = new Date().toISOString();
        
        const processed = newObservations.map(obs => ({
            id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: obs,
            timestamp,
            processed: false,
            type: this._classifyObservationType(obs)
        }));
        
        this.state.observationQueue.push(...processed);
        
        // 限制队列大小
        if (this.state.observationQueue.length > this.options.maxObservationHistory) {
            this.state.observationQueue = this.state.observationQueue.slice(-this.options.maxObservationHistory);
        }
        
        return processed;
    }
    
    /**
     * 触发分析过程
     * @param {string} triggerType - 触发类型
     */
    async _triggerAnalysis(triggerType) {
        if (this.state.isAnalyzing) {
            this.log('analysis_skipped', { reason: 'analysis_in_progress', triggerType });
            return;
        }
        
        this.state.isAnalyzing = true;
        const startTime = Date.now();
        
        try {
            const result = await this.analyzeObservations(triggerType);
            const duration = Date.now() - startTime;
            
            this.log('analysis_complete', {
                triggerType,
                duration,
                inputCount: this.state.observationQueue.length,
                result: {
                    userPreferences: result.userPreferences.length,
                    errorPatterns: result.errorPatterns.length,
                    successStrategies: result.successStrategies.length,
                    taskPatterns: result.taskPatterns.length,
                    conversationPatterns: result.conversationPatterns.length
                }
            });
            
            this.emit('analysis_complete', { triggerType, result, duration });
            
        } catch (error) {
            this.log('analysis_error', {
                triggerType,
                error: error.message,
                stack: error.stack
            });
            
            this.emit('analysis_error', { triggerType, error });
            
        } finally {
            this.state.isAnalyzing = false;
            this.state.lastAnalysisTime = Date.now();
        }
    }
    
    /**
     * 核心分析函数 - 分析队列中的观察
     * @param {string} triggerType - 触发类型
     * @returns {object} 分析结果
     */
    async analyzeObservations(triggerType) {
        const unprocessed = this.state.observationQueue.filter(obs => !obs.processed);
        