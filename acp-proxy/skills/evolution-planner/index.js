/**
 * Evolution Planner Skill
 * 
 * 自我进化规划技能 - 用于检测瓶颈、分解目标、生成改进计划
 * 
 * @module evolution-planner
 * @version 1.0.0
 * @author ACP System
 */

const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// 配置常量
// ============================================================================

const DEFAULT_CONFIG = {
  // 规划频率（毫秒）
  planningInterval: 3600000, // 1小时
  // 确认超时时间（毫秒）
  confirmationTimeout: 86400000, // 24小时
  // 最大子目标数量
  maxSubGoals: 10,
  // 进度报告路径
  reportsPath: 'acp-proxy/reports/evolution',
  // 待确认计划路径
  pendingPlansPath: 'acp-proxy/data/pending-plans',
  // 知识库路径
  knowledgeBasePath: 'acp-proxy/data/evolution-knowledge',
  // 进度阈值（低于此值视为缓慢）
  slowProgressThreshold: 0.2,
  // 零进度目标关键词
  zeroProgressKeywords: ['自编程', '工具创造', '错误自修复', 'self-coding', 'tool-creation', 'error-recovery'],
  // 触发分析的未分析观察阈值
  unanalyzedThreshold: 0,
  // 保守策略：是否需要人工确认
  requireHumanConfirmation: true,
  // 日志级别
  logLevel: 'info'
};

// ============================================================================
// 日志工具
// ============================================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] || 1;
  }

  debug(...args) {
    if (this.level <= 0) console.log('[EVOLUTION-PLANNER][DEBUG]', new Date().toISOString(), ...args);
  }

  info(...args) {
    if (this.level <= 1) console.log('[EVOLUTION-PLANNER][INFO]', new Date().toISOString(), ...args);
  }

  warn(...args) {
    if (this.level <= 2) console.warn('[EVOLUTION-PLANNER][WARN]', new Date().toISOString(), ...args);
  }

  error(...args) {
    if (this.level <= 3) console.error('[EVOLUTION-PLANNER][ERROR]', new Date().toISOString(), ...args);
  }
}

// ============================================================================
// 进度跟踪系统
// ============================================================================

class ProgressTracker {
  constructor(reportsPath) {
    this.reportsPath = reportsPath;
    this.history = [];
  }

  /**
   * 记录进度快照
   */
  async recordSnapshot(goals, timestamp = new Date()) {
    const snapshot = {
      timestamp: timestamp.toISOString(),
      goals: goals.map(g => ({
        id: g.id,
        name: g.name,
        progress: g.progress,
        status: g.status,
        blockers: g.blockers || []
      }))
    };
    this.history.push(snapshot);
    return snapshot;
  }

  /**
   * 计算进度趋势
   */
  calculateTrend(goalId, windowSize = 5) {
    const relevantSnapshots = this.history
      .filter(s => s.goals.some(g => g.id === goalId))
      .slice(-windowSize);

    if (relevantSnapshots.length < 2) return 'insufficient_data';

    const progressValues = relevantSnapshots.map(s => {
      const goal = s.goals.find(g => g.id === goalId);
      return goal ? goal.progress : 0;
    });

    const firstHalf = progressValues.slice(0, Math.floor(progressValues.length / 2));
    const secondHalf = progressValues.slice(Math.floor(progressValues.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (avgSecond > avgFirst + 0.05) return 'improving';
    if (avgSecond < avgFirst - 0.05) return 'declining';
    return 'stagnant';
  }

  /**
   * 生成进度报告
   */
  async generateReport(goals, analysisResults = {}) {
    const timestamp = new Date();
    const report = {
      title: '进化进度报告',
      generatedAt: timestamp.toISOString(),
      summary: {
        totalGoals: goals.length,
        completedGoals: goals.filter(g => g.progress >= 1.0).length,
        inProgressGoals: goals.filter(g => g.progress > 0 && g.progress < 1.0).length,
        stalledGoals: goals.filter(g => g.progress === 0).length,
        averageProgress: goals.reduce((sum, g) => sum + g.progress, 0) / goals.length
      },
      goals: goals.map(g => ({
        ...g,
        trend: this.calculateTrend(g.id),
        daysSinceUpdate: g.lastUpdate ? Math.floor((timestamp - new Date(g.lastUpdate)) / 86400000) : null
      })),
      analysis: analysisResults,
      recommendations: []
    };

    // 生成建议
    report.goals.forEach(goal => {
      if (goal.progress === 0) {
        report.recommendations.push({
          priority: 'high',
          goalId: goal.id,
          goalName: goal.name,
          message: `目标"${goal.name}"尚未开始，建议立即分析瓶颈并制定启动计划`
        });
      } else if (goal.trend === 'declining') {
        report.recommendations.push({
          priority: 'high',
          goalId: goal.id,
          goalName: goal.name,
          message: `目标"${goal.name}"进度下降，需要检查是否有新的阻碍因素`
        });
      } else if (goal.trend === 'stagnant' && goal.progress < 0.5) {
        report.recommendations.push({
          priority: 'medium',
          goalId: goal.id,
          goalName: goal.name,
          message: `目标"${goal.name}"进度停滞，建议重新评估策略`
        });
      }
    });

    // 保存报告
    await this.saveReport(report, timestamp);
    return report;
  }

  async saveReport(report, timestamp) {
    try {
      await fs.mkdir(this.reportsPath, { recursive: true });
      const filename = `evolution-report-${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
      await fs.writeFile(
        path.join(this.reportsPath, filename),
        JSON.stringify(report, null, 2)
      );
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }
}

// ============================================================================
// 目标分解算法
// ============================================================================

class GoalDecomposer {
  /**
   * 将大目标分解为可管理的小任务
   */
  static decompose(goal, context = {}) {
    const { name, description, category, progress } = goal;

    // 基于类别选择分解策略
    switch (category) {
      case 'self-coding':
        return GoalDecomposer.decomposeCodingGoal(goal, context);
      case 'tool-creation':
        return GoalDecomposer.decomposeToolGoal(goal, context);
      case 'error-recovery':
        return GoalDecomposer.decomposeErrorGoal(goal, context);
      default:
        return GoalDecomposer.decomposeGenericGoal(goal, context);
    }
  }

  static decomposeCodingGoal(goal, context) {
    return {
      subGoals: [
        {
          id: `${goal.id}-sg-1`,
          name: '分析现有代码结构',
          description: '理解当前系统的代码组织和架构模式',
          estimatedEffort: '2-4小时',
          dependencies: [],
          successCriteria: '能够绘制出完整的代码依赖图'
        },
        {
          id: `${goal.id}-sg-2`,
          name: '定义代码生成规范',
          description: '建立代码生成的规则和约束',
          estimatedEffort: '3-5小时',