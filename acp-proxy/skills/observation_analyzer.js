/**
 * 观察分析技能模块
 * 用于定期扫描并分析未处理观察，提取结构化知识模式
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class ObservationAnalyzer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // 技能配置
        this.name = 'observation_analyzer';
        this.description = '定期分析未处理观察，提取结构化知识模式';
        this.version = '1.0.0';
        
        // 触发配置
        this.triggerInterval = config.triggerInterval || 30000; // 30秒
        this.triggerTurns = config.triggerTurns || 5; // 每5个对话轮次
        this.maxHistory = config.maxHistory || 50; // 分析最近50条对话历史
        
        // 分析配置
        this.analysisThreshold = config.analysisThreshold || 3; // 最少需要3条观察才触发分析
        this.knowledgeBasePath = config.knowledgeBasePath || './data/knowledge_base.json';
        
        // 内部状态
        this.turnCounter = 0;
        this.lastAnalysisTime = Date.now();
        this.isAnalyzing = false;
        this.observationQueue = [];
        this.conversationHistory = [];
        
        // 初始化日志系统
        this.setupLogging();
        
        // 初始化定时器
        this.setupTriggers();
        
        // 加载知识库
        this.loadKnowledgeBase();
    }

    /**
     * 设置日志系统
     */
    setupLogging() {
        this.logFile = path.join(__dirname, `../logs/observation_analyzer_${new Date().toISOString().split('T')[0]}.log`);
        this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    }

    /**
     * 记录日志
     */
    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            skill: this.name,
            message,
            data
        };
        
        this.logStream.write(JSON.stringify(logEntry) + '\n');
        
        if (level === 'error') {
            console.error(`[${this.name}] ${message}`, data);
        } else if (level === 'info') {
            console.log(`[${this.name}] ${message}`);
        }
    }

    /**
     * 设置触发条件
     */
    setupTriggers() {
        // 定时器触发
        this.intervalTimer = setInterval(() => {
            this.checkTriggers('timer');
        }, this.triggerInterval);
        
        this.log('info', '触发器设置完成', {
            interval: this.triggerInterval,
            turns: this.triggerTurns
        });
    }

    /**
     * 检查是否满足触发条件
     */
    checkTriggers(source = 'manual') {
        const currentTime = Date.now();
        const timeSinceLast = currentTime - this.lastAnalysisTime;
        
        // 检查时间触发
        if (source === 'timer' && timeSinceLast >= this.triggerInterval) {
            this.log('info', '时间触发条件满足，开始分析');
            this.analyzeObservations().catch(error => {
                this.log('error', '分析过程发生错误', error.message);
            });
            return;
        }
        
        // 检查对话轮次触发
        if (source === 'turn' && this.turnCounter >= this.triggerTurns) {
            this.log('info', '对话轮次触发条件满足，开始分析');
            this.analyzeObservations().catch(error => {
                this.log('error', '分析过程发生错误', error.message);
            });
            this.turnCounter = 0; // 重置计数器
        }
    }

    /**
     * 添加新观察到队列
     */
    addObservation(observation) {
        if (!observation || typeof observation !== 'object') {
            this.log('warn', '无效的观察对象', observation);
            return;
        }
        
        const processedObservation = {
            id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            content: observation,
            processed: false,
            source: observation.source || 'unknown'
        };
        
        this.observationQueue.push(processedObservation);
        
        // 检查是否需要立即分析
        if (this.observationQueue.length >= this.analysisThreshold) {
            this.checkTriggers('queue');
        }
        
        this.log('info', '新观察已添加到队列', { 
            id: processedObservation.id,
            queueLength: this.observationQueue.length 
        });
    }

    /**
     * 更新对话历史
     */
    updateConversationHistory(turn) {
        this.conversationHistory.push({
            timestamp: Date.now(),
            turnNumber: this.conversationHistory.length + 1,
            content: turn
        });
        
        // 保持历史记录在最大限制内
        if (this.conversationHistory.length > this.maxHistory) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
        }
        
        this.turnCounter++;
        this.checkTriggers('turn');
    }

    /**
     * 核心分析函数：分析未处理观察
     */
    async analyzeObservations() {
        if (this.isAnalyzing) {
            this.log('warn', '分析正在进行中，跳过本次分析');
            return null;
        }
        
        this.isAnalyzing = true;
        this.lastAnalysisTime = Date.now();
        
        const analysisStartTime = Date.now();
        this.log('info', '开始观察分析');
        
        try {
            // 1. 提取待分析数据
            const observationsToAnalyze = this.extractObservations();
            const conversationContext = this.extractConversationContext();
            
            if (observationsToAnalyze.length === 0) {
                this.log('info', '没有未处理的观察，跳过分析');
                return null;
            }
            
            // 2. 应用分析策略
            const analysisResults = await this.applyAnalysisStrategies(
                observationsToAnalyze, 
                conversationContext
            );
            
            // 3. 格式化并存储结果
            const structuredKnowledge = this.formatAnalysisResults(analysisResults);
            await this.saveToKnowledgeBase(structuredKnowledge);
            
            // 4. 标记观察为已处理
            this.markObservationsProcessed(observationsToAnalyze);
            
            const analysisDuration = Date.now() - analysisStartTime;
            this.log('info', '观察分析完成', {