/**
 * acp-proxy/skills/auto_analyze_and_integrate.js
 * 核心技能：探索-分析-内化反馈循环
 * 解决'分析与执行脱节'失败模式的关键组件
 */

const fs = require('fs').promises;
const path = require('path');

class AutoAnalyzeAndIntegrate {
    constructor() {
        this.dataPath = path.resolve(__dirname, '../data');
        this.observationsFile = path.join(this.dataPath, 'observations.json');
        this.memoriesPath = path.join(this.dataPath, 'memories');
        this.skillsPath = path.resolve(__dirname, '.');
        this.reportsPath = path.join(this.dataPath, 'analysis_reports');
    }

    /**
     * 主入口函数：执行分析周期
     * @returns {Promise<Object>} 分析报告
     */
    async runAnalysisCycle() {
        const report = {
            timestamp: new Date().toISOString(),
            observationsAnalyzed: 0,
            newSkillsCreated: 0,
            skillsUpdated: 0,
            memoriesUpdated: 0,
            insights: [],
            actions: [],
            success: false,
            error: null
        };

        try {
            // 1. 读取未分析观察
            const unanalyzedObservations = await this.getUnanalyzedObservations();
            report.observationsAnalyzed = unanalyzedObservations.length;

            if (unanalyzedObservations.length === 0) {
                report.success = true;
                report.insights.push('No unanalyzed observations found');
                await this.saveReport(report);
                return report;
            }

            // 2. 调用分析模型
            const analysisResults = await this.analyzeObservations(unanalyzedObservations);

            // 3. 关联与内化
            const integrationResults = await this.integrateAnalysisResults(analysisResults);
            report.newSkillsCreated = integrationResults.newSkillsCreated;
            report.skillsUpdated = integrationResults.skillsUpdated;
            report.memoriesUpdated = integrationResults.memoriesUpdated;
            report.insights.push(...integrationResults.insights);

            // 4. 更新观察状态
            await this.updateObservationStatus(unanalyzedObservations, analysisResults);

            report.success = true;
            report.actions = integrationResults.actions;

        } catch (error) {
            report.error = error.message;
            report.success = false;
            console.error('Analysis cycle failed:', error);
        }

        // 5. 生成并保存报告
        await this.saveReport(report);
        return report;
    }

    /**
     * 读取未分析的观察记录
     */
    async getUnanalyzedObservations() {
        try {
            const data = await fs.readFile(this.observationsFile, 'utf8');
            const observations = JSON.parse(data);
            return observations.filter(obs => obs.analyzed === false);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // 文件不存在时返回空数组
            }
            throw new Error(`Failed to read observations: ${error.message}`);
        }
    }

    /**
     * 分析观察记录
     */
    async analyzeObservations(observations) {
        const analysisResults = [];

        // 按技能分组分析（可优化为批量处理）
        const groupedBySkill = this.groupObservationsBySkill(observations);

        for (const [skillName, skillObservations] of Object.entries(groupedBySkill)) {
            try {
                const analysis = await this.performSkillAnalysis(skillName, skillObservations);
                analysisResults.push({
                    skillName,
                    observations: skillObservations,
                    analysis
                });
            } catch (error) {
                console.error(`Failed to analyze skill ${skillName}:`, error);
                analysisResults.push({
                    skillName,
                    observations: skillObservations,
                    analysis: { error: error.message }
                });
            }
        }

        return analysisResults;
    }

    /**
     * 执行单个技能的分析
     */
    async performSkillAnalysis(skillName, observations) {
        // 构建分析提示
        const prompt = this.buildAnalysisPrompt(skillName, observations);

        // 调用推理能力（这里模拟调用，实际需要根据系统实现）
        const analysis = await this.callInference(prompt);

        // 解析分析结果
        return this.parseAnalysisResult(analysis);
    }

    /**
     * 构建分析提示
     */
    buildAnalysisPrompt(skillName, observations) {
        const observationSummary = observations.map(obs => {
            return `- ${obs.timestamp}: ${obs.context} (结果: ${obs.success ? '成功' : '失败'})`;
        }).join('\n');

        return `
你正在分析技能 "${skillName}" 的使用记录。请分析以下观察结果并提供结构化分析：

观察记录：
${observationSummary}

请提供以下分析：
1. 总体模式识别：识别成功和失败的模式
2. 成功原因分析：哪些因素导致了成功
3. 失败原因分析：哪些因素导致了失败
4. 可复用模式：提取可以推广到其他场景的模式
5. 改进建议：基于分析结果提出具体改进建议
6. 内化建议：建议将哪些发现内化为系统记忆或技能

请以JSON格式返回分析结果。
`;
    }

    /**
     * 调用推理能力
     */
    async callInference(prompt) {
        // 这里应该调用系统的推理能力
        // 例如通过 inference 技能或直接与核心模型交互
        // 为演示目的，返回模拟结果
        return {
            summary: "技能执行分析完成",
            patterns: ["模式1", "模式2"],
            successFactors: ["因素1", "因素2"],
            failureFactors: ["因素1", "因素2"],
            reusablePatterns: ["模式A", "模式B"],
            improvements: ["改进建议1", "改进建议2"],
            internalizationSuggestions: [
                { type: "memory", content: "相关记忆内容" },
                { type: "skill_update", skill: "example_skill", parameters: {} }
            ]
        };
    }

    /**
     * 解析分析结果
     */
    parseAnalysisResult(analysis) {
        return {
            summary: analysis.summary || "分析完成",
            patterns: analysis.patterns || [],
            successFactors: analysis.successFactors || [],
            failureFactors: analysis.failureFactors || [],
            reusablePatterns: analysis.reusablePatterns || [],
            improvements: analysis.improvements || [],
            internalizationSuggestions: analysis.internalizationSuggestions || []
        };
    }

    /**
     * 集成分析结果
     */
    async integrateAnalysisResults(analysisResults) {
        const results = {
            newSkillsCreated: 0,
            skillsUpdated: 0,
            memoriesUpdated: 0,
            insights: [],
            actions: []
        };

        for (const analysisResult of analysisResults) {
            try {
                // 更新记忆
                const memoryResult = await this.updateMemories(analysisResult);
                results.memoriesUpdated += memoryResult.updated;
                results.insights.push(...memoryResult.insights);

                // 内化为技能
                const skillResult = await this.internalizeAsSkills(analysisResult);
                results.newSkillsCreated += skillResult.created;
                results.skillsUpdated += skillResult.updated;
                results.actions.push(...skillResult.actions);

            } catch (error) {
                console.error(`Failed to integrate results for ${analysisResult.skillName}:`, error);
            }
        }

        return results;
    }

    /**
     * 更新记忆
     */
    async updateMemories(analysisResult) {
        const result = { updated: 0, insights: [] };

        // 为每个分析结果创建记忆条目
        const memoryContent = this.createMemoryContent(analysisResult);

        try {