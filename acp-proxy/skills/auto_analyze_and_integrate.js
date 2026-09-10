// acp-proxy/skills/auto_analyze_and_integrate.js
// 核心技能：探索-分析-内化循环
// 功能：处理未分析的观察，评估效果，内化成功模式，形成学习闭环。

const fs = require('fs').promises;
const path = require('path');

// 假设这些依赖或接口在系统中存在
// const { inferFromObservations } = require('../inference'); // 用于调用推理能力
// const { updateSkill, createSkill } = require('../skill_manager'); // 用于操作技能库

// 内置的记忆文件路径（示例，实际路径应根据系统配置调整）
const MEMORY_FILE_PATH = path.join(__dirname, '../data/memories.json');
const OBSERVATIONS_FILE_PATH = path.join(__dirname, '../data/observations.json');
const LOG_FILE_PATH = path.join(__dirname, '../data/analysis_cycle_logs.json');

/**
 * 主入口函数：运行一次分析周期。
 * 由系统在探索性操作或改进规划后主动调用。
 * @returns {Promise<Object>} 分析周期的结果报告
 */
async function runAnalysisCycle() {
    const cycleReport = {
        cycleId: Date.now(),
        timestamp: new Date().toISOString(),
        status: 'started',
        observationsProcessed: 0,
        analysisResults: [],
        internalizationActions: [],
        errors: []
    };

    try {
        // 1. 读取未分析的观察
        cycleReport.status = 'reading_observations';
        const observations = await loadUnanalyzedObservations();
        if (observations.length === 0) {
            cycleReport.status = 'completed_no_observations';
            cycleReport.message = '没有找到未分析的观察记录。';
            await saveReport(cycleReport);
            return cycleReport;
        }
        cycleReport.observationsProcessed = observations.length;

        // 2. 逐条或分组调用分析
        cycleReport.status = 'analyzing';
        const analysisPromises = observations.map(obs => analyzeSingleObservation(obs));
        const analysisResults = await Promise.allSettled(analysisPromises);

        // 处理分析结果
        for (let i = 0; i < analysisResults.length; i++) {
            const result = analysisResults[i];
            if (result.status === 'fulfilled') {
                const analysis = result.value;
                cycleReport.analysisResults.push({
                    observationId: observations[i].id,
                    analysis: analysis.summary,
                    patterns: analysis.extractedPatterns,
                    suggestions: analysis.skillUpdateSuggestions || []
                });

                // 3. 关联与内化：尝试将分析结果整合到系统
                try {
                    const internalizationResult = await internalizeAnalysis(analysis, observations[i]);
                    if (internalizationResult.actionTaken) {
                        cycleReport.internalizationActions.push({
                            observationId: observations[i].id,
                            action: internalizationResult.action,
                            detail: internalizationResult.detail
                        });
                    }
                } catch (intError) {
                    cycleReport.errors.push({
                        phase: 'internalization',
                        observationId: observations[i].id,
                        error: intError.message
                    });
                }

                // 4. 更新观察状态为已分析
                try {
                    await markObservationAsAnalyzed(observations[i].id, analysis.summary);
                } catch (markError) {
                    cycleReport.errors.push({
                        phase: 'mark_observation',
                        observationId: observations[i].id,
                        error: markError.message
                    });
                }
            } else {
                cycleReport.errors.push({
                    phase: 'analysis',
                    observationId: observations[i].id,
                    error: result.reason.message
                });
            }
        }

        // 更新最终状态
        cycleReport.status = cycleReport.errors.length > 0 ? 'completed_with_errors' : 'completed_successfully';
        cycleReport.summary = generateCycleSummary(cycleReport);
        await saveReport(cycleReport);

        return cycleReport;
    } catch (criticalError) {
        cycleReport.status = 'failed';
        cycleReport.errors.push({
            phase: 'cycle_execution',
            error: criticalError.message
        });
        await saveReport(cycleReport).catch(() => {}); // 尝试保存错误报告
        throw criticalError; // 重新抛出供上层处理
    }
}

/**
 * 加载所有未分析的观察记录
 * @returns {Promise<Array>} 未分析的观察对象数组
 */
async function loadUnanalyzedObservations() {
    try {
        const fileContent = await fs.readFile(OBSERVATIONS_FILE_PATH, 'utf8');
        const observationsData = JSON.parse(fileContent);
        // 假设observationsData是一个数组，或者有observations字段
        const observationsArray = Array.isArray(observationsData) ? observationsData : (observationsData.observations || []);
        return observationsArray.filter(obs => obs.analyzed === false || obs.analyzed === undefined);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`[auto_analyze] 观察文件 ${OBSERVATIONS_FILE_PATH} 不存在，返回空数组。`);
            return [];
        }
        throw new Error(`读取观察文件失败: ${error.message}`);
    }
}

/**
 * 分析单条观察记录
 * @param {Object} observation - 单个观察对象
 * @returns {Promise<Object>} 分析结果对象
 */
async function analyzeSingleObservation(observation) {
    // 首先尝试调用系统推理能力（例如 inference 技能）
    // const inferenceResult = await inferFromObservations([observation]);
    // if (inferenceResult && inferenceResult.success) {
    //     return inferenceResult.analysis;
    // }

    // 内置回退分析逻辑（当外部推理不可用或失败时使用）
    console.log(`[auto_analyze] 使用内置逻辑分析观察 ${observation.id}`);

    // 简单的模式提取逻辑（示例，实际应更复杂）
    const summary = `对观察 ${observation.id} 的总结：${observation.content.substring(0, 100)}...`;
    const extractedPatterns = [];

    // 示例：从内容中提取关键词作为模式
    if (observation.content.includes('错误') || observation.content.includes('失败')) {
        extractedPatterns.push({ type: 'failure_pattern', keywords: ['错误', '失败'], confidence: 0.7 });
    }
    if (observation.content.includes('成功') || observation.content.includes('完成')) {
        extractedPatterns.push({ type: 'success_pattern', keywords: ['成功', '完成'], confidence: 0.8 });
    }

    // 示例：生成技能更新建议（这里仅作演示）
    const skillUpdateSuggestions = [];
    if (extractedPatterns.some(p => p.type === 'failure_pattern' && p.keywords.includes('参数校验'))) {
        skillUpdateSuggestions.push({
            skillId: 'self_introspect',
            action: 'update_documentation',
            reason: '发现与参数校验相关的失败模式。',
            suggestedAddition: '在参数校验部分增加更严格的检查逻辑。'
        });
    }

    return {
        summary,
        extractedPatterns,
        skillUpdateSuggestions,
        confidence: 0.6, // 内置逻辑的置信度通常较低
        source: 'built-in_analysis'
    };
}

/**
 * 将分析结果内化到系统
 * @param {Object} analysisResult - 分析结果
 * @param {Object} originalObservation - 原始观察
 * @returns {Promise<Object>} 内化动作结果
 */
async function internalizeAnalysis(analysisResult, originalObservation) {
    let actionTaken = false;
    let action = '';
    let detail = '';
