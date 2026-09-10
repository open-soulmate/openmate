// acp-proxy/skills/analyze-observations-skill.js
const memoryPlugin = require('../plugins/memory-plugin');

/**
 * 核心技能：分析观察记录
 * 功能：自动分析记忆库中状态为'unanalyzed'的观察记录，生成结构化分析报告
 * 是建立"观察-分析-行动"闭环的关键技能
 */

// 进化目标配置
const EVOLUTION_GOALS = {
  ERROR_SELF_REPAIR: 'error_self_repair',
  PERFORMANCE_OPTIMIZATION: 'performance_optimization',
  KNOWLEDGE_ACQUISITION: 'knowledge_acquisition',
  TOOL_CREATION: 'tool_creation'
};

// 问题模式关键词映射
const PATTERN_KEYWORDS = {
  [EVOLUTION_GOALS.ERROR_SELF_REPAIR]: ['错误', '异常', '失败', '失败', '崩溃', 'bug', 'error', 'exception', 'crash'],
  [EVOLUTION_GOALS.PERFORMANCE_OPTIMIZATION]: ['慢', '延迟', '性能', '优化', '瓶颈', 'slow', 'latency', 'performance', 'bottleneck'],
  [EVOLUTION_GOALS.KNOWLEDGE_ACQUISITION]: ['学习', '知识', '理解', '模式', 'learn', 'knowledge', 'understand', 'pattern'],
  [EVOLUTION_GOALS.TOOL_CREATION]: ['工具', '构建', '创建', '新功能', 'tool', 'build', 'create', 'new feature']
};

/**
 * 分析单条观察记录
 * @param {Object} observation - 观察记录对象
 * @returns {Object} 分析结果
 */
async function analyzeObservation(observation) {
  try {
    const content = observation.content || '';
    const contentLower = content.toLowerCase();
    
    // 1. 识别问题/模式
    const detectedPatterns = [];
    const goalAssociations = [];
    
    for (const [goal, keywords] of Object.entries(PATTERN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          detectedPatterns.push(keyword);
          if (!goalAssociations.includes(goal)) {
            goalAssociations.push(goal);
          }
        }
      }
    }
    
    // 2. 生成建议的微小改进措施
    const suggestedActions = [];
    
    if (goalAssociations.includes(EVOLUTION_GOALS.ERROR_SELF_REPAIR)) {
      suggestedActions.push('检查相关错误日志');
      suggestedActions.push('添加错误处理代码');
    }
    
    if (goalAssociations.includes(EVOLUTION_GOALS.PERFORMANCE_OPTIMIZATION)) {
      suggestedActions.push('优化相关代码路径');
      suggestedActions.push('添加性能监控');
    }
    
    if (goalAssociations.includes(EVOLUTION_GOALS.KNOWLEDGE_ACQUISITION)) {
      suggestedActions.push('记录模式为新知识点');
      suggestedActions.push('创建相关文档');
    }
    
    if (goalAssociations.includes(EVOLUTION_GOALS.TOOL_CREATION)) {
      suggestedActions.push('创建新的工具模块');
      suggestedActions.push('封装为可重用组件');
    }
    