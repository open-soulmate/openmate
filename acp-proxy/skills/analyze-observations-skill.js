// acp-proxy/skills/analyze-observations-skill.js
// 观察分析技能 - 自动分析记忆库中的未分析观察记录，生成结构化分析结论

const { get_observations, update_observation_status, create_memory } = require('../plugins/memory-plugin');

// 简单的统计分析工具 - 内联的微小工具创造实例
class SimpleStatisticAnalyzer {
  constructor() {
    this.patterns = {
      error: /error|fail|exception|crash|bug/i,
      warning: /warn|alert|issue|concern/i,
      success: /success|complete|achieve|improve/i,
      opportunity: /opportunity|potential|could|might/i,
      dependency: /depend|require|need|rely/i
    };
  }

  // 分析观察内容，提取类型和关键模式
  analyzeContent(content) {
    const findings = [];
    const metrics = {
      typeDistribution: {},
      severity: this.assessSeverity(content),
      complexity: this.estimateComplexity(content),
      relatedGoals: this.identifyGoals(content)
    };

    // 模式匹配
    for (const [pattern, regex] of Object.entries(this.patterns)) {
      if (regex.test(content)) {
        metrics.typeDistribution[pattern] = (metrics.typeDistribution[pattern] || 0) + 1;
        findings.push({
          type: pattern,
          match: content.match(regex)[0],
          position: content.search(regex)
        });
      }
    }

    // 简单关键词提取
    const keywords = this.extractKeywords(content);
    
    return {
      findings,
      metrics,
      keywords,
      sentiment: this.analyzeSentiment(content),
      relevance: this.assessRelevance(content)
    };
  }

  assessSeverity(content) {
    const criticalPatterns = /critical|fatal|severe|urgent/i;
    const highPatterns = /high|important|significant/i;
    
    if (criticalPatterns.test(content)) return 'critical';
    if (highPatterns.test(content)) return 'high';
    return 'medium';
  }

  estimateComplexity(content) {
    const words = content.split(/\s+/).length;
    if (words > 100) return 'complex';
    if (words > 50) return 'moderate';
    return 'simple';
  }

  identifyGoals(content) {
    const goalMappings = {
      'error-self-repair': /error|bug|fix|repair/i,
      'performance-optimization': /slow|performance|speed|optimize/i,
      'tool-creation': /tool|utility|create|develop/i,
      'learning-efficiency': /learn|knowledge|understand|study/i,
      'system-stability': /stable|reliable|consistent/i
    };
    
    const matchedGoals = [];
    for (const [goal, pattern] of Object.entries(goalMappings)) {
      if (pattern.test(content)) {
        matchedGoals.push(goal);
      }
    }
    
    return matchedGoals.length > 0 ? matchedGoals : ['general-improvement'];
  }

  extractKeywords(content) {
    // 简单的关键词提取（去停用词）
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
                              'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 
                              'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to', 
                              'for', 'with', 'on', 'at', 'from', 'by', 'as', 'into', 'through', 
                              'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off']);
    
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // 词频统计
    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // 返回前10个高频词
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }

  analyzeSentiment(content) {
    const positiveWords = /good|great|excellent|improve|success|better|enhance/i;
    const negativeWords = /bad|poor|fail|problem|issue|error|worse|degrade/i;
    
    const positiveMatches = (content.match(positiveWords) || []).length;
    const negativeMatches = (content.match(negativeWords) || []).length;
    
    if (positiveMatches > negativeMatches) return 'positive';
    if (negativeMatches > positiveMatches) return 'negative';
    return 'neutral';
  }

  assessRelevance(content) {
    // 简单的相关性评估（基于关键词密度和内容长度）
    const wordCount = content.split(/\s+/).length;
    const keywordDensity = this.extractKeywords(content).length / Math.max(wordCount, 1);
    
    if (keywordDensity > 0.1 && wordCount > 20) return 'high';
    if (keywordDensity > 0.05 || wordCount > 50) return 'medium';
    return 'low';
  }
}

// 主技能函数
async function analyzeObservations() {
  console.log('[analyze-observations-skill] 开始分析未处理的观察记录');
  
  const analyzer = new SimpleStatisticAnalyzer();
  const results = {
    processedCount: 0,
    analyzedCount: 0,
    reportId: null,
    errors: [],
    summary: {}
  };

  try {
    // 1. 获取所有未分析的观察记录
    const unanalyzedObservations = await get_observations({
      status: 'unanalyzed',
      limit: 100 // 设置批次大小，避免单次处理过多
    });

    if (!unanalyzedObservations || unanalyzedObservations.length === 0) {
      console.log('[analyze-observations-skill] 没有找到未分析的观察记录');
      return {
        success: true,
        message: '没有待分析的观察记录',
        ...results
      };
    }
