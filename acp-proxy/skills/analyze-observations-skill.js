// acp-proxy/skills/analyze-observations-skill.js

import {
  get_observations,
  update_observation_status,
  store_memory
} from '../../plugins/memory-plugin.js';

/**
 * 核心技能：分析未处理的观察记录
 * 功能：自动获取状态为 'unanalyzed' 的观察，进行分析，生成报告，并更新记录状态。
 * 这是建立“观察-分析-行动”闭环的关键组件。
 */
export async function analyze_observations_skill() {
  const result = {
    success: false,
    analyzed_count: 0,
    report_ids: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  try {
    // 步骤1: 获取所有未分析的观察记录
    const unanalyzed_observations = await get_observations({ status: 'unanalyzed' });

    if (!Array.isArray(unanalyzed_observations)) {
      throw new Error('从记忆插件获取观察记录失败，返回数据格式不正确。');
    }

    if (unanalyzed_observations.length === 0) {
      result.success = true;
      result.message = '没有发现需要分析的观察记录。';
      return result;
    }

    // 步骤2: 对每条观察进行分析，并准备更新和报告数据
    const analysisPromises = unanalyzed_observations.map(async (observation) => {
      try {
        // 步骤2 & 3: 进行语义理解和模式识别（内联简单分析示例）
        const analysis = analyze_single_observation(observation);

        // 准备更新元数据
        const update_metadata = {
          analysis_summary: analysis.summary,
          analysis_details: analysis.details,
          analysis_timestamp: new Date().toISOString(),
          related_goals: analysis.related_goals
        };

        // 准备将作为新记忆存储的分析报告
        const analysis_report = {
          type: 'analysis_report',
          source_observation_id: observation.id,
          content: {
            summary: analysis.summary,
            full_analysis: analysis,
            suggested_actions: analysis.suggested_actions
          },
          metadata: {
            analyzed_at: new Date().toISOString(),
            skill_version: '1.0.0'
          }
        };

        return {
          observation_id: observation.id,
          update_metadata,
          analysis_report
        };
      } catch (analysisError) {
        // 捕获单个观察分析过程中的错误，避免中断整个流程
        result.errors.push({
          observation_id: observation.id,
          error: analysisError.message,
          phase: 'single_observation_analysis'
        });
        return null; // 返回 null 表示此条记录处理失败
      }
    });

    const analysisResults = (await Promise.all(analysisPromises)).filter(Boolean); // 过滤掉失败的(null)

    // 步骤4: 批量更新观察记录的状态
    const updatePromises = analysisResults.map(async ({ observation_id, update_metadata }) => {
      try {
        await update_observation_status(observation_id, 'analyzed', update_metadata);
        return observation_id;
      } catch (updateError) {
        result.errors.push({
          observation_id,
          error: updateError.message,
          phase: 'status_update'
        });
        return null;
      }
    });

    const updated_ids = (await Promise.all(updatePromises)).filter(Boolean);
    result.analyzed_count = updated_ids.length;

    // 步骤5: 将分析报告作为新记忆存储
    const storePromises = analysisResults.map(async ({ analysis_report, observation_id }) => {
      // 只有对应的观察记录更新成功，才存储报告
      if (updated_ids.includes(observation_id)) {
        try {
          const report_id = await store_memory(analysis_report);
          return report_id;
        } catch (storeError) {
          result.errors.push({
            observation_id,
            error: storeError.message,
            phase: 'report_storage'
          });
          return null;
        }
      }
      return null;
    });

    const report_ids = (await Promise.all(storePromises)).filter(Boolean);
    result.report_ids = report_ids;

    // 如果有部分失败，但仍有部分成功，则技能仍视为成功完成
    if (result.analyzed_count > 0) {
      result.success = true;
      result.message = `成功分析了 ${result.analyzed_count} 条观察记录，生成了 ${report_ids.length} 份分析报告。`;
      if (result.errors.length > 0) {
        result.message += ` 过程中有 ${result.errors.length} 个错误发生。`;
      }
    } else {
      // 所有记录处理都失败
      throw new Error(`所有 ${unanalyzed_observations.length} 条观察记录的分析均失败。`);
    }

    return result;

  } catch (skillError) {
    // 捕获整个技能流程的顶层错误
    result.success = false;
    result.message = `技能执行失败: ${skillError.message}`;
    result.errors.push({ error: skillError.message, phase: 'skill_flow' });
    // 在实际系统中，这里可能需要记录日志或触发警报
    console.error('[analyze-observations-skill] 执行错误:', skillError);
    return result;
  }
}

/**
 * 内联的简单分析工具（第一个微小工具创造的实例）
 * 对单条观察记录进行基础的语义分析和模式识别。
 * @param {object} observation - 单个观察记录对象，至少包含 { id, content, metadata }
 * @returns {object} 分析结果
 */
function analyze_single_observation(observation) {
  if (!observation || !observation.content) {
    throw new Error('观察记录格式异常：缺少 content 字段。');
  }

  // 基础的统计分析：计算内容中的关键词分布（示例）
  const content = typeof observation.content === 'string' 
    ? observation.content 
    : JSON.stringify(observation.content);

  // 模式识别：简单的关键词匹配和类型推断
  const patterns = {
    error: /错误|失败|异常|bug/i,
    performance: /慢|延迟|性能|卡顿|优化/i,
    config: /配置|设置|参数|调整/i,
    logic: /逻辑|流程|算法|步骤/i,
    tool: /工具|脚本|插件|函数|创建/i,
    goal: /目标|计划|任务|里程碑/i
  };

  const detected_patterns = [];
  const related_goals = [];
  let primary_type = 'general';

  for (const [type, regex] of Object.entries(patterns)) {
    if (regex.test(content)) {
      detected_patterns.push(type);
      // 简单的规则：如果检测到error模式，则关联‘错误自修复’目标
      if (type === 'error') {
        related_goals.push('error_self_repair');
      } else if (type === 'performance') {
        related_goals.push('performance_optimization');
      }
      // 将第一个匹配到的类型作为主类型
      if (primary_type === 'general') {
        primary_type = type;
      }