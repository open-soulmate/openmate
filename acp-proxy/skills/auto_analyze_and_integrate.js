const fs = require('fs');
const path = require('path');

// 数据文件路径
const OBSERVATIONS_FILE = path.join(__dirname, '../data/observations.json');
const MEMORIES_FILE = path.join(__dirname, '../data/memories.json');
const SKILLS_DIR = path.join(__dirname, '.');

// 假设存在推理技能，通过require获取
let inference;
try {
    inference = require('./inference');
} catch (e) {
    // 如果不存在，使用内置的简单推理函数
    inference = {
        generate: async (prompt) => {
            console.warn('Inference skill not found, using fallback');
            return JSON.stringify({summary: "Fallback analysis", patterns: [], insights: []});
        }
    };
}

class AutoAnalyzeAndIntegrate {
    constructor() {
        this.name = 'auto_analyze_and_integrate';
        this.description = '探索-分析-内化反馈循环核心技能';
    }

    /**
     * 主要分析周期函数
     * @returns {Object} 分析报告
     */
    async runAnalysisCycle() {
        const report = {
            timestamp: new Date().toISOString(),
            observationsAnalyzed: 0,
            newSkillsCreated: 0,
            skillsUpdated: 0,
            newPatterns: [],
            errors: []
        };

        try {
            // 1. 读取未分析观察
            const observations = await this.loadObservations();
            const unanalyzedObs = observations.filter(obs => obs.analyzed === false);

            if (unanalyzedObs.length === 0) {
                report.message = 'No unanalyzed observations found';
                await this.saveReport(report);
                return report;
            }

            // 2. 分批处理观察（每批3-5条，避免上下文过长）
            const batchSize = 5;
            for (let i = 0; i < unanalyzedObs.length; i += batchSize) {
                const batch = unanalyzedObs.slice(i, i + batchSize);
                
                // 3. 调用分析模型
                const analysisResult = await this.analyzeBatch(batch, report);
                
                // 4. 关联与内化
                await this.integrateFindings(analysisResult, report);
                
                // 5. 更新观察状态
                await this.updateObservationsStatus(batch, analysisResult.summary);
                
                report.observationsAnalyzed += batch.length;
            }

            // 保存最终报告
            await this.saveReport(report);
            
            console.log(`Analysis cycle completed. Analyzed ${report.observationsAnalyzed} observations.`);
            return report;

        } catch (error) {
            report.errors.push(`Analysis cycle failed: ${error.message}`);
            await this.saveReport(report);
            throw error;
        }
    }

    /**
     * 加载观察记录
     * @returns {Array} 观察记录数组
     */
    async loadObservations() {
        try {
            if (!fs.existsSync(OBSERVATIONS_FILE)) {
                fs.writeFileSync(OBSERVATIONS_FILE, JSON.stringify({ observations: [] }, null, 2));
                return [];
            }
            
            const data = JSON.parse(fs.readFileSync(OBSERVATIONS_FILE, 'utf8'));
            return data.observations || [];
        } catch (error) {
            console.error('Failed to load observations:', error);
            return [];
        }
    }

    /**
     * 分析一批观察记录
     * @param {Array} batch - 观察记录批次
     * @param {Object} report - 报告对象
     * @returns {Object} 分析结果
     */
    async analyzeBatch(batch, report) {
        try {
            const prompt = this.createAnalysisPrompt(batch);
            const response = await inference.generate(prompt);
            
            try {
                const analysis = JSON.parse(response);
                report.newPatterns.push(...(analysis.patterns || []));
                return analysis;
            } catch (parseError) {
                // 如果返回的不是JSON，创建默认结构
                return {
                    summary: response,
                    patterns: [],
                    insights: [],
                    recommendations: []
                };
            }
        } catch (error) {
            report.errors.push(`Failed to analyze batch: ${error.message}`);
            return {
                summary: `Analysis failed for ${batch.length} observations`,
                patterns: [],
                insights: [],
                recommendations: []
            };
        }
    }

    /**
     * 创建分析提示词
     * @param {Array} observations - 观察记录
     * @returns {string} 提示词
     */