// acp-proxy/plugins/evolution_engine_plugin.js
// 增强进化引擎的规划一致性和自我执行能力

class EvolutionEnginePlugin {
  constructor() {
    this.pluginName = 'EvolutionEnginePlugin';
    this.version = '2.0.0';
  }

  /**
   * 核心方法：生成进化计划
   * @param {Object} context - 进化上下文，包含历史记录、目标状态等
   * @returns {Array} 改进任务列表
   */
  _generate_evolution_plan(context) {
    const { 
      historicalFailures = [], 
      currentGoalsProgress = {},
      currentLoop = 0 
    } = context;

    // 调用原始计划生成逻辑
    let originalPlan = this._originalGeneratePlan(context);

    // 1. 强制确保至少生成一项改进计划
    if (!originalPlan || originalPlan.length === 0) {
      const mandatoryPlan = this._generateMandatoryImprovement(
        currentGoalsProgress, 
        historicalFailures
      );
      originalPlan = [mandatoryPlan];
      console.log(`[EvolutionEngine] Loop ${currentLoop}: 生成强制改进计划，避免规划0项`);
    }

    // 2. 调整执行者分配策略，提高self执行比例
    const adjustedPlan = originalPlan.map(task => {
      return this._adjustExecutorAssignment(task, context);
    });

    return adjustedPlan;
  }

  /**
   * 生成强制改进计划
   * @param {Object} goalsProgress - 当前目标进度
   * @param {Array} failures - 历史失败模式
   * @returns {Object} 改进任务
   */
  _generateMandatoryImprovement(goalsProgress, failures) {
    // 基于目标进度选择改进方向
    const priorityGoal = this._selectPriorityGoal(goalsProgress);
    
    // 生成基础改进任务
    const baseTask = {
      type: this._getImprovementTypeForGoal(priorityGoal),
      description: this._generateBasicImprovementDesc(priorityGoal, failures),
      priority: 'medium',
      estimatedTime: 30, // 默认30分钟
      requiredResources: [],
      dependencies: []
    };

    return baseTask;
  }

  /**
   * 选择优先级最高的目标
   * @param {Object} goalsProgress
   * @returns {string} 目标名称
   */
  _selectPriorityGoal(goalsProgress) {
    // 简单策略：选择进度最慢的目标
    let minProgress = Infinity;
    let priorityGoal = 'general';
    
    for (const [goal, progress] of Object.entries(goalsProgress)) {
      if (progress < minProgress) {
        minProgress = progress;
        priorityGoal = goal;
      }
    }
    
    return priorityGoal;
  }

  /**
   * 根据目标确定改进类型
   * @param {string} goal
   * @returns {string} 改进类型
   */
  _getImprovementTypeForGoal(goal) {
    const typeMapping = {
      'self_programming': 'skill_enhancement',
      'tool_creation': 'tool_development',
      'knowledge_acquisition': 'knowledge_expansion',
      'problem_solving': 'optimization',
      'general': 'general_improvement'
    };
    
    return typeMapping[goal] || 'general_improvement';
  }

  /**
   * 生成基础改进描述
   * @param {string} goal
   * @param {Array} failures
   * @returns {string} 描述文本
   */
  _generateBasicImprovementDesc(goal, failures) {
    // 分析最近失败模式
    const recentFailures = failures.slice(-3);
    let failureContext = '';
    
    if (recentFailures.length > 0) {
      failureContext = `，考虑近期失败模式：${recentFailures.map(f => f.type).join('、')}`;
    }
    
    return `针对${goal}目标的基础改进${failureContext}`;
  }

  /**
   * 调整执行者分配策略
   * @param {Object} task - 原始任务
   * @param {Object} context - 上下文
   * @returns {Object} 调整后的任务
   */
  _adjustExecutorAssignment(task, context) {
    const { selfCapabilities = {} } = context;
    const taskType = task.type;
    
    // 强制指定self执行的任务类型
    const forceSelfTypes = ['mcp_creation', 'self_repair', 'skill_enhancement'];
    
    // 优先执行的任务类型（给予self更高权重）
    const preferSelfTypes = ['tool_development', 'optimization', 'code_refactoring'];
    
    let executor = task.executor; // 保留原始分配
    let executorReason = '';
    
    // 1. 强制指定逻辑
    if (forceSelfTypes.includes(taskType)) {
      executor = 'self';
      executorReason = `强制指定：${taskType}类型任务必须由self执行`;
    } 
    // 2. 优先分配逻辑（基于权重计算）
    else if (preferSelfTypes.includes(taskType)) {
      const selfWeight = this._calculateSelfWeight(taskType, context);
      const randomValue = Math.random();
      
      if (randomValue < selfWeight) {
        executor = 'self';
        executorReason = `权重分配：${taskType}任务的self权重为${(selfWeight*100).toFixed(0)}%`;
      } else {
        executorReason = `权重分配：${taskType}任务分配给partner执行`;
      }
    }
    // 3. 其他任务保持原始分配
    else {
      executorReason = `保持原始分配：${taskType}任务`;
    }
    
    // 添加执行分配元数据
    return {
      ...task,
      executor: executor,
      executorAssignment: {
        reason: executorReason,
        adjusted: executor !== task.executor,
        timestamp: new Date().toISOString(),
        strategy: this._getStrategyName(taskType)
      }
    };
  }

  /**
   * 计算self执行权重
   * @param {string} taskType
   * @param {Object} context
   * @returns {number} 权重值 0-1
   */