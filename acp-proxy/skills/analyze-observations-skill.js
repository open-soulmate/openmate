/**
 * analyze-observations-skill.js
 * 核心技能：自动分析记忆库中的未观察记录，生成结构化分析报告与行动建议。
 * 这是建立"观察-分析-行动"闭环的关键组件，用于打破进化循环停滞。
 * 
 * 功能概述：
 * 1. 获取记忆库中所有状态为 'unanalyzed' 的观察记录。
 * 2. 对每条记录进行语义分析和模式识别。
 * 3. 生成分析报告，关联进化目标，并提供微小改进建议。
 * 4. 更新已分析记录的状态为 'analyzed'，并附加摘要。
 * 5. 将分析报告作为新记忆类型 'analysis_report' 存回记忆库。
 * 
 * 依赖：acp-proxy/plugins/memory-plugin.js
 * 本技能自身力求模块化、清晰，便于未来自我修改和优化。
 */

// 导入记忆插件。假设 memory-plugin.js 导出了一个包含所需方法的对象。
// 在实际集成时，路径可能需要调整或使用依赖注入。这里我们模拟导入。
const memoryPlugin = require('../plugins/memory-plugin.js');

// 辅助工具：一个简单的统计分析函数，用于计算最近N条观察的类型分布。
// 这是内联的第一个微小工具创造实例，体现了"自编程"的初级目标。
function analyzeTypeDistribution(observations, lastN = 50) {
    const recent = observations.slice(-lastN); // 取最近N条
    const distribution = {};
    for (const obs of recent) {
        // 假设观察记录有一个 'type' 字段，如果没有则归类为 'unknown'
        const type = (obs.metadata && obs.metadata.type) || 'unknown';
        distribution[type] = (distribution[type] || 0) + 1;
    }
    return {
        distribution,
        total: recent.length,
        period: `最近 ${recent.length} 条记录`
    };
}

// 主技能函数：异步执行，无参数，返回操作结果。
async function analyzeObservationsSkill() {
    const startTime = new Date();
    let processedCount = 0;
    let updatedCount = 0;
    let reportId = null;
    const errors = []; // 收集非致命错误，避免中断流程

    console.log(`[${startTime.toISOString()}] 开始执行 analyze-observations-skill...`);

    try {
        // 1. 获取未分析的观察记录
        console.log('步骤1：获取状态为 "unanalyzed" 的观察记录...');
        let unanalyzedObservations;
        try {
            // 调用记忆插件的 get_observations 接口
            unanalyzedObservations = await memoryPlugin.get_observations({ status: 'unanalyzed' });
            if (!Array.isArray(unanalyzedObservations)) {
                throw new Error('记忆插件返回的未分析记录不是数组格式');
            }
        } catch (fetchError) {
            throw new Error(`获取未分析观察记录失败: ${fetchError.message}`);
        }

        if (unanalyzedObservations.length === 0) {
            console.log('没有找到需要分析的观察记录。');
            return {
                success: true,
                analyzedCount: 0,
                updatedCount: 0,
                reportId: null,
                message: '无需分析，无未处理观察记录。',
                timestamp: startTime.toISOString()
            };
        }

        console.log(`找到 ${unanalyzedObservations.length} 条未分析的观察记录。`);
        processedCount = unanalyzedObservations.length;

        // 2 & 3. 对每条观察记录进行分析，生成分析结论与建议
        console.log('步骤2/3：开始逐条分析观察记录，识别问题/模式并生成建议...');
        const analysisResults = [];
        // 内联统计：计算类型分布（作为工具创造实例）
        const typeDistribution = analyzeTypeDistribution(unanalyzedObservations, 50);

        for (const observation of unanalyzedObservations) {
            try {
                // 确保观察记录结构合理
                if (!observation.id || !observation.content) {
                    throw new Error(`观察记录缺少必要字段 (id 或 content): ${JSON.stringify(observation)}`);
                }

                // 模拟语义理解和模式识别。实际实现中，这里可能调用更复杂的NLP服务或规则引擎。
                // 这里我们基于内容关键词进行简单模式匹配作为示例。
                const content = observation.content.toLowerCase();
                let identifiedIssues = [];
                let evolutionGoals = [];
                let suggestedActions = [];

                // 简单的模式识别示例
                if (content.includes('error') || content.includes('fail')) {
                    identifiedIssues.push('检测到错误或失败事件');
                    evolutionGoals.push('错误自修复');
                    suggestedActions.push('添加更详细的错误日志记录');
                }
                if (content.includes('slow') || content.includes('timeout')) {
                    identifiedIssues.push('性能瓶颈或超时');
                    evolutionGoals.push('性能优化');
                    suggestedActions.push('分析该操作的耗时，考虑异步处理或缓存');
                }
                if (content.includes('config') || content.includes('setting')) {
                    identifiedIssues.push('配置相关观察');
                    evolutionGoals.push('系统自配置');
                    suggestedActions.push('审查相关配置项的合理性');
                }
                if (content.includes('new tool') || content.includes('idea')) {
                    identifiedIssues.push('工具或创意点子');
                    evolutionGoals.push('工具创造');
                    suggestedActions.push('详细规划该工具的实现，定义最小可行产品');
                }

                // 如果没有匹配到特定模式，则进行通用分析
                if (identifiedIssues.length === 0) {
                    identifiedIssues.push('未识别出特定模式');
                    evolutionGoals.push('通用知识积累');
                    suggestedActions.push('将此观察作为一般经验记录，等待更多相关数据');
                }

                // 生成该条记录的分析摘要
                const observationAnalysis = {
                    originalObservationId: observation.id,
                    analysisTimestamp: new Date().toISOString(),
                    identifiedIssues,
                    evolutionGoals,
                    suggestedActions,
                    summary: `观察记录 "${observation.content.substring(0, 50)}..." 被分析为: ${identifiedIssues.join('; ')}. 关联进化目标: ${evolutionGoals.join(', ')}.`
                };
                analysisResults.push(observationAnalysis);

            } catch (analysisError) {
                // 单条记录分析失败，记录错误但继续处理下一条
                console.error(`分析观察记录 ${observation.id} 时出错: ${analysisError.message}`);
                errors.push({
                    recordId: observation.id,
                    error: analysisError.message,
                    phase: 'analysis'
                });
                // 不将这条记录标记为已分析，保持原状，下次可能修复数据后重试
                continue; // 跳过后续的更新步骤
            }
        }

        // 4. 更新已成功分析记录的状态
        console.log('步骤4：更新已分析观察记录的状态...');
        for (const result of analysisResults) {
            try {
                await memoryPlugin.update_observation_status({
                    observation_id: result.originalObservationId,
                    new_status: 'analyzed',
                    metadata: {
                        analysis_summary: result.summary,
                        analysis_timestamp: result.analysisTimestamp,
                        identified_issues: result.identifiedIssues,
                        evolution_goals: result.evolutionGoals,
                        suggested_actions: result.suggestedActions
                    }
                });
                updatedCount++;
            } catch (updateError) {
                console.error(`更新观察记录 ${result.originalObservationId} 状态失败: ${updateError.message}`);
                errors.push({
                    recordId: result.originalObservationId,
                    error: updateError.message,
                    phase: 'status_update'
                });
            }
        }

        // 5. 生成并存储整体的分析报告记忆
        console.log('步骤5：生成并存储整体分析报告...');
        const reportContent = {
            type: 'analysis_report',
            generation_timestamp: new Date().toISOString(),
            execution_period: {
                start: startTime.toISOString(),
                end: new Date().toISOString()
            },
            statistics: {
                total_unanalyzed: processedCount,
                successfully_analyzed: analysisResults.length,
                successfully_updated: updatedCount,
                errors_count: errors.length,
                type_distribution_snapshot: typeDistribution // 包含内联工具的输出
            },