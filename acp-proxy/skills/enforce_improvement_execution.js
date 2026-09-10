const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONFIG = {
  enabled: true,
  logPath: path.join(__dirname, '../plugins/evolution-engine/cycle_logs'),
  defaultImprovementPool: [
    {
      type: 'self_fix',
      description: '分析一个未处理的observation',
      requirements: '从最近的observation列表中选择一个未处理的观察，进行详细分析并生成改进报告',
      commit_message: '强制改进：分析未处理的observation'
    },
    {
      type: 'self_programming',
      description: '尝试优化一个现有函数的性能',
      requirements: '识别一个性能瓶颈函数，提出至少两种优化方案并实现其中一个',
      commit_message: '强制改进：优化函数性能'
    },
    {
      type: 'self_fix',
      description: '为某个模块编写一个单元测试',
      requirements: '选择一个覆盖率不足的模块，编写完整的单元测试用例',
      commit_message: '强制改进：编写单元测试'
    },
    {
      type: 'self_fix',
      description: '清理技术债务',
      requirements: '识别并清理代码中的TODO、FIXME或临时解决方案',
      commit_message: '强制改进：清理技术债务'
    },
    {
      type: 'self_programming',
      description: '实现一个新的错误处理机制',
      requirements: '分析最近的错误模式，设计并实现一个更健壮的错误处理流程',
      commit_message: '强制改进：增强错误处理'
    }
  ],
  failurePatternMapping: {
    '自省债务累积': {
      type: 'self_fix',
      description: '清理所有未分析的observations',
      requirements: '系统性地处理队列中的所有未分析观察，建立定期清理机制',
      commit_message: '强制改进：清理自省债务'
    },
    '执行停滞': {
      type: 'self_programming',
      description: '创建一个执行监控任务',
      requirements: '实现一个监控机制来检测执行停滞，并在检测到时自动触发改进',
      commit_message: '强制改进：执行停滞监控'
    }
  }
};

class EnforceImprovementExecution {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lastCycleLog = null;
  }

  async getLastCycleLog(cycleId = null) {
    try {
      const logDir = this.config.logPath;
      await fs.mkdir(logDir, { recursive: true });
      
      let logFiles = await fs.readdir(logDir);
      logFiles = logFiles
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();

      if (logFiles.length === 0) {
        console.log('No cycle logs found');
        return null;
      }
