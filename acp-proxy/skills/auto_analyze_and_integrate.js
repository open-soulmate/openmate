/**
 * Auto Analyze and Integrate Skill
 * 负责建立'探索-分析-内化'的强反馈循环，处理未分析观察，评估改进效果，整合成功模式到系统记忆或技能库
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AutoAnalyzeAndIntegrate {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.skillsDir = __dirname;
        this.memoriesFile = path.join(this.dataDir, 'memories.json');
        this.observationsFile = path.join(this.dataDir, 'observations.json');
        this.reportsDir = path.join(this.dataDir, 'analysis_reports');
        
        // 确保目录存在
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
        
        // 初始化文件如果不存在
        if (!fs.existsSync(this.memoriesFile)) {
            fs.writeFileSync(this.memoriesFile, JSON.stringify([], null, 2));
        }
        if (!fs.existsSync(this.observationsFile)) {
            fs.writeFileSync(this.observationsFile, JSON.stringify([], null, 2));
        }
    }

    /**
     * 主要入口函数 - 运行分析周期
     * @returns {Object} 分析报告
     */
    async runAnalysisCycle() {
        console.log('开始运行分析周期...');
        
        try {
            // 1. 读取未分析观察
            const unanalyzedObservations = this.getUnanalyzedObservations();
            
            if (unanalyzedObservations.length === 0) {
                return {
                    success: true,
                    message: '没有未分析的观察记录',
                    analyzedCount: 0,
                    newInsights: [],
                    integrationActions: []
                };
            }

            console.log(`找到 ${unanalyzedObservations.length} 条未分析的观察记录`);

            // 2. 调用分析模型进行分析
            const analysisResults = await this.analyzeObservations(unanalyzedObservations);
            
            // 3. 关联与内化
            const integrationResult = await this.integrateInsights(analysisResults);
            
            // 4. 更新观察状态
            this.updateObservationStatus(unanalyzedObservations, analysisResults);
            
            // 5. 生成分析报告
            const report = this.generateReport(analysisResults, integrationResult);
            
            // 保存报告
            this.saveReport(report);
            
            console.log('分析周期完成');
            return report;
            
        } catch (error) {
            console.error('分析周期执行失败:', error);
            return {
                success: false,
                error: error.message,
                analyzedCount: 0,
                newInsights: [],
                integrationActions: []
            };
        }
    }

    /**
     * 获取未分析的观察记录
     * @returns {Array} 未分析的观察记录数组
     */
    getUnanalyzedObservations() {
        try {
            const observationsData = fs.readFileSync(this.observationsFile, 'utf8');
            const observations = JSON.parse(observationsData);
            
            return observations.filter(obs => obs.analyzed === false);
        } catch (error) {
            console.error('读取观察记录失败:', error);
            return [];
        }
    }

    /**
     * 分析观察记录
     * @param {Array} observations 未分析的观察记录
     * @returns {Array} 分析结果数组
     */
    async analyzeObservations(observations) {
        const analysisResults = [];
        
        // 按类别或时间分组分析，这里简化为逐条分析
        for (const observation of observations) {
            try {
                const analysis = await this.analyzeSingleObservation(observation);
                analysisResults.push({
                    observationId: observation.id,
                    analysis: analysis,
                    timestamp: new Date().toISOString()
                });
                
                // 简单的延迟，避免过快调用
                await this.delay(100);
            } catch (error) {
                console.error(`分析观察 ${observation.id} 失败:`, error);
                analysisResults.push({
                    observationId: observation.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        return analysisResults;
    }

    /**
     * 分析单条观察记录
     * @param {Object} observation 观察记录
     * @returns {Object} 分析结果
     */
    async analyzeSingleObservation(observation) {
        // 这里应该调用系统的推理能力，这里模拟分析逻辑
        
        const analysis = {
            summary: '',
            successFactors: [],
            failurePatterns: [],
            reusablePatterns: [],
            suggestedImprovements: []
        };
        
        // 根据观察类型进行分析
        if (observation.type === 'task_result') {
            analysis.summary = `任务 ${observation.taskId} 的执行结果分析`;
            
            if (observation.success) {
                analysis.successFactors.push('任务成功的关键因素分析');
                analysis.reusablePatterns.push({
                    pattern: observation.pattern || '成功模式',
                    context: observation.context,
                    confidence: 0.8
                });
            } else {
                analysis.failurePatterns.push({
                    pattern: observation.errorPattern || '失败模式',
                    context: observation.context,
                    frequency: 1
                });
                analysis.suggestedImprovements.push('建议改进的方面');
            }
        } else if (observation.type === 'system_behavior') {
            analysis.summary = `系统行为分析: ${observation.description}`;
            analysis.reusablePatterns.push({
                pattern: observation.behavior,
                context: observation.environment,
                confidence: 0.7
            });
        } else {
            analysis.summary = `通用观察分析: ${observation.description || '未知类型'}`;
        }
        
        return analysis;
    }

    /**
     * 关联与内化分析结果
     * @param {Array} analysisResults 分析结果数组
     * @returns {Object} 集成结果
     */
    async integrateInsights(analysisResults) {
        const integrationResult = {
            newSkillsCreated: [],
            existingSkillsUpdated: [],
            memoriesUpdated: [],
            newInsights: []
        };
        
        try {
            // 加载现有记忆
            const memories = this.loadMemories();
            
            for (const result of analysisResults) {
                if (result.error) continue;
                
                const analysis = result.analysis;
                
                // 提取可复用模式
                for (const pattern of analysis.reusablePatterns) {
                    // 检查是否已存在类似模式
                    const existingPattern = memories.find(m => 
                        m.type === 'pattern' && 
                        m.content.pattern === pattern.pattern
                    );
                    
                    if (existingPattern) {
                        // 更新现有模式
                        existingPattern.confidence = Math.min(1, existingPattern.confidence + 0.1);
                        existingPattern.lastUpdated = new Date().toISOString();
                        integrationResult.memoriesUpdated.push(existingPattern.id);
                    } else {
                        // 创建新记忆条目
                        const newMemory = {
                            id: uuidv4(),
                            type: 'pattern',
                            content: pattern,
                            created: new Date().toISOString(),
                            lastUpdated: new Date().toISOString(),
                            source: `analysis_${result.observationId}`
                        };
                        memories.push(newMemory);
                        integrationResult.newInsights.push(newMemory);
                    }
                }
                
                // 检查是否需要创建新技能
                if (analysis.reusablePatterns.length >= 3 || 
                    analysis.suggestedImprovements.length >= 2) {
                    
                    const skillCreated = await this.createOrUpdateSkill(analysis, result.observationId);
                    if (skillCreated) {
                        integrationResult.newSkillsCreated.push(skillCreated);
                    }
                }
            }
            