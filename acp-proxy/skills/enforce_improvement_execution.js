const fs = require('fs');
const path = require('path');

// 静态待办改进池
const DEFAULT_IMPROVEMENT_POOL = [
  {
    type: 'self_fix',
    description: '分析一个未处理的observation',
    requirements: '选择最近的一个未分析observation，进行深入分析并记录见解',
    commit_message: '自动生成：分析未处理observation以提升洞察力'
  },
  {
    type: 'self_programming',
    description: '尝试优化一个现有函数的性能',
    requirements: '识别性能瓶颈函数，实施优化（如算法改进或缓存），并编写基准测试',
    commit_message: '自动生成：优化函数性能以提升系统效率'
  },
  {
    type: 'self_fix',
    description: '为某个模块编写一个单元测试',
    requirements: '选择关键模块，编写覆盖核心功能的单元测试，确保代码健壮性',
    commit_message: '自动生成：添加单元测试以增强代码可靠性'
  }
];

// 基于failure_patterns动态生成任务
function generateDynamicTask(failurePatterns) {
  if (failurePatterns && failurePatterns.includes('自省债务累积')) {
    return {
      type: 'self_fix',
      description: '清理所有未分析的observations',
      requirements: '批量处理积压的observations，更新相关日志和数据库',
      commit_message: '自动生成：清理自省债务以改进系统反思'
    };
  }
  // 可以添加更多模式匹配逻辑
  return null; // 如果没有匹配，返回null以使用静态池
}

// 主函数：强制执行改进执行闭环
function enforceImprovementExecution(lastCycleLogPath, currentCyclePlanPath, config = { enabled: true }) {
  // 检查开关配置
  if (!config.enabled) {
    console.log('改进执行强制技能已禁用');
    return;
  }

  try {
    // 读取并解析上一个cycle的日志
    const lastCycleLogData = fs.readFileSync(lastCycleLogPath, 'utf8');
    const lastCycleLog = JSON.parse(lastCycleLogData);

    // 检查planned_improvements_count
    const improvementsCount = lastCycleLog.planned_improvements_count;
    if (improvementsCount !== undefined && improvementsCount > 0) {
      console.log(`前一个cycle有${improvementsCount}项计划改进，无需强制执行`);
      return;
    }

    // 计划改进缺失或为0，触发自动注入
    console.log('检测到计划改进缺失，启动自动改进注入...');

    // 尝试基于failure_patterns动态生成任务
    let selectedTask = null;
    if (lastCycleLog.failure_patterns) {
      selectedTask = generateDynamicTask(lastCycleLog.failure_patterns);
    }

    // 如果没有动态任务，从静态池中随机选择
    if (!selectedTask) {
      const pool = DEFAULT_IMPROVEMENT_POOL;
      const randomIndex = Math.floor(Math.random() * pool.length);
      selectedTask = pool[randomIndex];
    }

    // 生成改进方案对象
    const improvementPlan = {
      type: selectedTask.type,
      description: selectedTask.description,
      requirements: selectedTask.requirements,
      commit_message: selectedTask.commit_message,
      auto_generated: true, // 标记为自动生成
      timestamp: new Date().toISOString()
    };

    // 读取当前cycle的规划文件
    let currentPlan = {};
    if (fs.existsSync(currentCyclePlanPath)) {
      const currentPlanData = fs.readFileSync(currentCyclePlanPath, 'utf8');
      currentPlan = JSON.parse(currentPlanData);
    }

    // 注入改进方案到规划输出
    if (!currentPlan.improvements) {
      currentPlan.improvements = [];
    }
    currentPlan.improvements.push(improvementPlan);
    currentPlan.planned_improvements_count = (currentPlan.planned_improvements_count || 0) + 1;

    // 写入更新后的规划文件
    fs.writeFileSync(currentCyclePlanPath, JSON.stringify(currentPlan, null, 2));
    console.log(`已自动注入改进任务: ${improvementPlan.description}`);

    // 记录事件到日志（这里我们更新lastCycleLog或写入单独日志）
    // 为了简单，我们附加事件到lastCycleLog并覆盖文件，但生产中可能需要更精细的日志管理
    lastCycleLog.auto_improvement_injection = {
      task: improvementPlan,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(lastCycleLogPath, JSON.stringify(lastCycleLog, null, 2));
    console.log('自动改进注入事件已记录到日志');

  } catch (error) {
    console.error('强制执行改进执行闭环时出错:', error.message);
  }
}

// 导出函数供外部调用
module.exports = {
  enforceImprovementExecution,
  DEFAULT_IMPROVEMENT_POOL
};

// 示例用法（注释掉，因为这是模块）
/*
// 假设路径从配置中获取
const lastLog = 'path/to/last_cycle_log.json';
const currentPlan = 'path/to/current_cycle_plan.json';
const config = { enabled: true };

enforceImprovementExecution(lastLog, currentPlan, config);
*/