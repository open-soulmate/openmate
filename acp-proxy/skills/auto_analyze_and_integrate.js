/**
 * auto_analyze_and_integrate.js
 * 探索-分析-内化强反馈循环技能
 */

const fs = require('fs');
const path = require('path');

// 配置路径
const OBSERVATIONS_PATH = path.join(__dirname, '../data/observations.json');
const MEMORIES_PATH = path.join(__dirname, '../data/memories.json');
const SKILLS_DIR = path.join(__dirname, '../skills');
const ANALYSIS_LOG_PATH = path.join(__dirname, '../data/analysis_logs.json');

/**
 * 读取未分析的观察记录
 * @returns {Promise<Array>} 未分析的观察记录数组
 */
async function loadUnanalyzedObservations() {
    try {
        if (!fs.existsSync(OBSERVATIONS_PATH)) {
            console.log('[auto_analyze] 观察记录文件不存在，返回空数组');
            return [];
        }

        const data = JSON.parse(fs.readFileSync(OBSERVATIONS_PATH, 'utf-8'));
        return Array.isArray(data) ? data.filter(obs => obs.analyzed === false) : [];
    } catch (error) {
        console.error('[auto_analyze] 读取观察记录失败:', error);
        return [];
    }
}

/**
 * 调用分析模型进行分析
 * @param {Array} observations 观察记录
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeObservations(observations) {
    try {
        if (!observations || observations.length === 0) {
            return { insights: [], patterns: [], recommendations: [] };
        }

        // 尝试使用系统推理能力
        try {
            const inferenceSkill = require('./inference');
            const result = await inferenceSkill.analyze({
                type: 'observation_analysis',
                data: observations,
                prompt: '分析以下观察记录，总结规律、提取模式、识别问题和成功因素，给出改进建议。'
            });
            return result;
        } catch (inferenceError) {
            console.warn('[auto_analyze] 推理技能不可用，使用基础分析:', inferenceError);
            return basicAnalysis(observations);
        }
    } catch (error) {
        console.error('[auto_analyze] 分析过程失败:', error);
        return { insights: [], patterns: [], recommendations: [], error: error.message };
    }
}

/**
 * 基础分析（当推理技能不可用时）
 * @param {Array} observations 观察记录
 * @returns {Object} 基础分析结果
 */
function basicAnalysis(observations) {
    const insights = [];
    const patterns = [];
    const recommendations = [];

    observations.forEach(obs => {
        if (obs.type === 'success') {
            insights.push(`成功案例: ${obs.content}`);
            patterns.push(`成功模式: ${obs.context || '未知上下文'}`);
        } else if (obs.type === 'failure') {
            insights.push(`失败案例: ${obs.content}`);
            recommendations.push(`改进点: ${obs.content}`);
        }
    });

    return { insights, patterns, recommendations };
}

/**
 * 加载现有记忆
 * @returns {Promise<Object>} 记忆数据
 */
async function loadMemories() {
    try {
        if (!fs.existsSync(MEMORIES_PATH)) {
            return { skills: [], knowledge: [], patterns: [] };
        }
        return JSON.parse(fs.readFileSync(MEMORIES_PATH, 'utf-8'));
    } catch (error) {
        console.error('[auto_analyze] 加载记忆失败:', error);