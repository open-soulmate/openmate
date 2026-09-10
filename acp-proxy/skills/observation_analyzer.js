// observation_analyzer.js
// 自主观察分析技能 - 定期扫描分析未处理观察，支持知识积累

const fs = require('fs').promises;
const path = require('path');

class ObservationAnalyzer {
    constructor(config = {}) {
        // 配置参数
        this.config = {
            // 触发条件配置
            triggerIntervalMs: config.triggerIntervalMs || 30000, // 30秒
            triggerTurnCount: config.triggerTurnCount || 5, // 每5个对话轮次
            
            // 分析配置
            recentWindow: config.recentWindow || 10, // 分析最近的N轮对话
            maxObservations: config.maxObservations || 50, // 最大处理观察数量
            
            // 文件路径
            observationsPath: config.observationsPath || path.join(__dirname, '../data/observations.json'),
            knowledgeBasePath: config.knowledgeBasePath || path.join(__dirname, '../data/knowledge_base.json'),
            logPath: config.logPath || path.join(__dirname, '../logs/observation_analyzer.log'),
            
            // NLP配置
            enableNLP: config.enableNLP || false,
            sentimentThreshold: config.sentimentThreshold || 0.5,
            
            ...config
        };
        
        // 内部状态
        this.turnCounter = 0;
        this.lastAnalysisTime = Date.now();
        this.isAnalyzing = false;
        this.analysisTimer = null;
        
        // 模板库
        this.templates = {
            preferencePatterns: [
                { pattern: /喜欢|偏好|倾向于|prefer/i, category: 'preference', weight: 0.8 },
                { pattern: /不喜欢|不要|避免|avoid/i, category: 'dislike', weight: 0.7 },
                { pattern: /经常|总是|通常|always/i, category: 'habit', weight: 0.6 }
            ],
            taskPatterns: [
                { pattern: /代码|编程|开发|code/i, category: 'coding', weight: 0.9 },
                { pattern: /问题|错误|bug|issue/i, category: 'problem_solving', weight: 0.7 },
                { pattern: /建议|推荐|help/i, category: 'request_advice', weight: 0.6 }
            ],
            feedbackPatterns: [
                { pattern: /好|不错|优秀|good/i, category: 'positive', weight: 0.8 },
                { pattern: /不好|错误|糟糕|bad/i, category: 'negative', weight: 0.8 },
                { pattern: /感谢|谢谢|thanks/i, category: 'gratitude', weight: 0.5 }
            ]
        };
        
        // 初始化
        this.init();
    }
    
    // 初始化技能
    async init() {
        try {
            await this.ensureDirectories();
            this.startTimer();
            this.log('ObservationAnalyzer initialized', 'info');
        } catch (error) {
            this.log(`Initialization failed: ${error.message}`, 'error');
        }
    }
    
    // 确保目录存在
    async ensureDirectories() {
        const dirs = [
            path.dirname(this.config.observationsPath),
            path.dirname(this.config.knowledgeBasePath),
            path.dirname(this.config.logPath)
        ];
        
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                // 目录可能已存在，忽略错误
            }
        }
    }
    
    // 启动定时器
    startTimer() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
        }
        
        this.analysisTimer = setInterval(() => {
            const timeSinceLastAnalysis = Date.now() - this.lastAnalysisTime;
            if (timeSinceLastAnalysis >= this.config.triggerIntervalMs) {
                this.analyzeObservations();
            }
        }, this.config.triggerIntervalMs);
    }
    
    // 对话轮次触发器
    onNewTurn() {
        this.turnCounter++;
        
        if (this.turnCounter >= this.config.triggerTurnCount) {
            this.turnCounter = 0;
            this.analyzeObservations();
        }
    }
    
    // 核心分析函数
    async analyzeObservations() {
        if (this.isAnalyzing) {
            this.log('Analysis already in progress, skipping', 'warn');
            return;
        }
        
        this.isAnalyzing = true;
        const startTime = Date.now();
        
        try {
            this.log('Starting observation analysis', 'info');
            
            // 1. 从观察队列获取未处理观察
            const observations = await this.loadObservations();
            const unprocessed = observations.filter(obs => !obs.processed);
            
            if (unprocessed.length === 0) {
                this.log('No unprocessed observations found', 'info');
                return;
            }
            
            // 2. 提取文本并分析
            const analysisResults = [];
            
            for (const observation of unprocessed.slice(0, this.config.maxObservations)) {
                const result = await this.analyzeObservation(observation);
                if (result) {
                    analysisResults.push(result);
                }
            }
            
            // 3. 存储分析结果到知识库
            if (analysisResults.length > 0) {
                await this.storeKnowledge(analysisResults);
                this.log(`Analyzed ${analysisResults.length} observations`, 'info');
            }
            
            // 4. 标记观察为已处理
            await this.markObservationsProcessed(unprocessed);
            
            // 5. 更新状态
            this.lastAnalysisTime = Date.now();
            
            const duration = Date.now() - startTime;
            this.log(`Analysis completed in ${duration}ms`, 'info');
            
            return {
                success: true,
                analyzedCount: analysisResults.length,
                duration: duration,
                results: analysisResults
            };
            