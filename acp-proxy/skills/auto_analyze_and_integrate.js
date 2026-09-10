/**
 * auto_analyze_and_integrate.js
 * 
 * 核心技能：探索-分析-内化 强反馈循环
 * 
 * 负责处理周期内积累的未分析观察，评估改进效果，
 * 将成功的模式、代码片段或结论整合到系统记忆或技能库中，形成学习闭环。
 */

const fs = require('fs').promises;
const path = require('path');

// 配置常量
const CONFIG = {
    observationsPath: path.join(__dirname, '../data/observations.json'),
    memoriesPath: path.join(__dirname, '../data/memories.json'),
    skillsPath: path.join(__dirname, '../skills'),
    analysisLogPath: path.join(__dirname, '../data/analysis_logs.json'),
    maxObservationsPerBatch: 10,
    analysisConfidenceThreshold: 0.7,
    internalizationThreshold: 0.8
};

/**
 * 主函数：运行分析周期
 * 可由系统在每次探索性操作或改进规划后主动调用
 * @param {Object} options - 可选配置
 * @param {number} options.batchSize - 每批处理的观察数量
 * @param {boolean} options.forceReanalysis - 是否强制重新分析已处理的观察
 * @param {Function} options.inferenceFn - 自定义推理函数（用于调用模型）
 * @returns {Object} 分析报告
 */
async function runAnalysisCycle(options = {}) {
    const {
        batchSize = CONFIG.maxObservationsPerBatch,
        forceReanalysis = false,
        inferenceFn = null
    } = options;

    const report = {
        timestamp: new Date().toISOString(),
        cycleId: generateCycleId(),
        status: 'started',
        observationsProcessed: 0,
        insightsExtracted: [],
        internalizations: [],
        errors: []
    };

    try {
        // 步骤1: 读取未分析观察
        console.log(`[${report.cycleId}] 正在读取未分析的观察记录...`);
        const unanalyzedObservations = await readUnanalyzedObservations(forceReanalysis);

        if (unanalyzedObservations.length === 0) {
            report.status = 'completed_no_work';
            report.message = '没有发现需要分析的观察记录';
            await saveAnalysisReport(report);
            return report;
        }

        // 步骤2: 分批处理观察
        const batches = createBatches(unanalyzedObservations, batchSize);
        let processedCount = 0;

        for (const batch of batches) {
            try {
                // 步骤2a: 调用分析模型
                console.log(`[${report.cycleId}] 正在分析批次 ${batches.indexOf(batch) + 1}/${batches.length}...`);
                const analysisResults = await analyzeObservations(batch, inferenceFn);

                // 步骤2b: 关联与内化
                const internalizationResults = await processInternalizations(analysisResults);

                // 步骤2c: 更新观察状态
                await updateObservationsStatus(batch, analysisResults);

                // 收集结果
                report.insightsExtracted.push(...analysisResults.insights);
                report.internalizations.push(...internalizationResults);
                processedCount += batch.length;

            } catch (batchError) {
                console.error(`[${report.cycleId}] 批次处理失败:`, batchError.message);
                report.errors.push({
                    type: 'batch_processing_error',
                    message: batchError.message,
                    batchIndex: batches.indexOf(batch)
                });
            }
        }

        // 步骤3: 生成最终报告
        report.observationsProcessed = processedCount;
        report.status = report.errors.length > 0 ? 'completed_with_errors' : 'completed';
        report.summary = generateSummary(report);

        // 保存报告到日志
        await saveAnalysisReport(report);

        console.log(`[${report.cycleId}] 分析周期完成。处理了 ${processedCount} 条观察，提取了 ${report.insightsExtracted.length} 条洞察。`);
        return report;

    } catch (error) {
        report.status = 'failed';
        report.error = error.message;
        report.errors.push({
            type: 'cycle_error',
            message: error.message,
            stack: error.stack
        });

        await saveAnalysisReport(report);
        throw error;
    }
}

/**
 * 读取未分析的观察记录
 * @param {boolean} forceReanalysis - 是否强制重新分析
 * @returns {Array} 未分析的观察记录数组
 */
async function readUnanalyzedObservations(forceReanalysis = false) {
    try {
        const data = await fs.readFile(CONFIG.observationsPath, 'utf8');
        const observations = JSON.parse(data);

        if (!Array.isArray(observations)) {
            throw new Error('观察记录格式错误：期望数组格式');
        }

        if (forceReanalysis) {
            return observations;
        }

        return observations.filter(obs => 
            obs.analyzed === false || obs.analyzed === undefined
        );

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn('观察文件不存在，返回空数组');
            return [];
        }
        throw new Error(`读取观察记录失败: ${error.message}`);
    }
}

/**
 * 分析观察记录
 * @param {Array} observations - 待分析的观察记录
 * @param {Function} inferenceFn - 推理函数
 * @returns {Object} 分析结果
 */
async function analyzeObservations(observations, inferenceFn) {
    const results = {
        insights: [],
        patterns: [],
        recommendations: [],
        rawData: {}
    };

    // 准备分析上下文
    const analysisContext = prepareAnalysisContext(observations);

    // 使用提供的推理函数或默认分析逻辑
    let analysisOutput;
    if (inferenceFn && typeof inferenceFn === 'function') {
        analysisOutput = await inferenceFn({
            task: 'observation_analysis',
            context: analysisContext,
            prompt: buildAnalysisPrompt(observations)
        });
    } else {
        // 默认分析逻辑
        analysisOutput = await performDefaultAnalysis(observations);
    }

    // 解析分析结果
    results.insights = extractInsights(analysisOutput, observations);
    results.patterns = extractPatterns(analysisOutput, observations);
    results.recommendations = extractRecommendations(analysisOutput);

    return results;
}

/**
 * 准备分析上下文
 * @param {Array} observations - 观察记录
 * @returns {Object} 上下文对象
 */
function prepareAnalysisContext(observations) {
    return {
        totalObservations: observations.length,
        categories: categorizeObservations(observations),
        timeRange: getTimeRange(observations),
        successRate: calculateSuccessRate(observations)
    };
}

/**
 * 构建分析提示词
 * @param {Array} observations - 观察记录
 * @returns {string} 提示词
 */
function buildAnalysisPrompt(observations) {
    const observationSummary = observations.map((obs, index) => {
        return `[观察${index + 1}]
类型: ${obs.type || '未分类'}
内容: ${typeof obs.content === 'object' ? JSON.stringify(obs.content) : obs.content}
结果: ${obs.result || '未知'}
时间: ${obs.timestamp || '未知'}
---`;
    }).join('\n');

    return `请分析以下观察记录，提取：
1. 成功/失败的模式
2. 可复用的代码片段或配置
3. 需要改进的领域
4. 通用知识或最佳实践

观察记录：
${observationSummary}

请以JSON格式输出分析结果，包含以下字段：
- insights: 洞察数组，每个洞察包含 id, content, confidence, category
- patterns: 模式数组，每个模式包含 id, description, examples, reusability
- recommendations: 建议数组，每个建议包含 id, action, priority, target`;
}

/**
 * 执行默认分析（当没有提供推理函数时）
 * @param {Array} observations - 观察记录
 * @returns {Object} 分析结果
 */
async function performDefaultAnalysis(observations) {
    const insights = [];
    const patterns = [];
    const recommendations = [];

    // 分析成功和失败的模式
    const successes = observations.filter(obs => obs.result === 'success' || obs.success === true);
    const failures = observations.filter(obs => obs.result === 'failure' || obs.success === false);

    // 提取成功模式
    if (successes.length > 0) {
        patterns.push({
            id: `pattern_success_${Date.now()}`,
            description: `成功模式: ${successes.length}次成功`,
            examples: successes.slice(0, 3).map(s => s.content),
            reusability: successes.length >= 3 ? 'high' : 'medium'