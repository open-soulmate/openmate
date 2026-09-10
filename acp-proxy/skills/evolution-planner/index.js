const fs = require('fs').promises;
const path = require('path');

class EvolutionPlanner {
  constructor(config = {}) {
    this.config = {
      planCheckInterval: 24 * 60 * 60 * 1000, // 24小时
      confirmationTimeout: 48 * 60 * 60 * 1000, // 48小时
      plansDirectory: './evolution_plans',
      progressFile: './evolution_progress.json',
      knowledgeBaseFile: './evolution_knowledge.json',
      targetProgressThreshold: 0.0,
      autoConfirmRiskLevel: 'low',
      ...config
    };
    
    this.skills = new Map();
    this.observationAnalyzer = null;
    this.progressTracker = new ProgressTracker();
    this.goalDecomposer = new GoalDecomposer();
    
    this.evolutionTargets = [
      'self_programming',
      'tool_creation',
      'error_self_repair'
    ];
  }

  async initialize(skillSystem, observationAnalyzer) {
    this.skills = skillSystem;
    this.observationAnalyzer = observationAnalyzer;
    
    // 确保计划目录存在
    await fs.mkdir(this.config.plansDirectory, { recursive: true });
    
    // 初始化进度跟踪器
    await this.progressTracker.load(this.config.progressFile);
    
    // 设置定期检查
    this.setupPeriodicChecks();
    
    console.log('Evolution Planner initialized');
  }

  setupPeriodicChecks() {
    // 定期检查目标进度
    setInterval(async () => {
      await this.checkProgressAndGeneratePlans();
    }, this.config.planCheckInterval);
    
    // 定期检查未分析的观察
    setInterval(async () => {
      await this.checkUnanalyzedObservations();
    }, 60 * 60 * 1000); // 每小时检查一次
  }

  async checkProgressAndGeneratePlans() {
    try {
      const progress = await this.progressTracker.getProgress();
      const plans = [];
      
      // 检查每个进化目标的进度
      for (const target of this.evolutionTargets) {
        const targetProgress = progress[target] || { progress: 0, lastUpdated: null };
        
        // 分析进度缓慢的原因
        const analysis = await this.analyzeTargetProgress(target, targetProgress);
        
        // 针对零进度目标生成具体计划
        if (targetProgress.progress <= this.config.targetProgressThreshold) {
          const plan = await this.generateTargetPlan(target, analysis);
          plans.push(plan);
        }
      }
      
      // 保存生成的计划
      if (plans.length > 0) {
        await this.savePlans(plans);
        this.logPlanGeneration(plans);
      }
      
      // 生成进化路线图
      await this.generateEvolutionRoadmap();
      
    } catch (error) {
      console.error('Error in checkProgressAndGeneratePlans:', error);
    }
  }

  async analyzeTargetProgress(target, progress) {
    const analysis = {
      target,
      currentProgress: progress.progress,
      bottlenecks: [],
      failurePatterns: [],
      recommendations: []
    };
    
    // 分析失败模式
    if (progress.failures && progress.failures.length > 0) {
      analysis.failurePatterns = this.identifyFailurePatterns(progress.failures);
    }
    
    // 识别系统瓶颈
    analysis.bottlenecks = await this.identifySystemBottlenecks(target, progress);
    
    return analysis;
  }

  identifyFailurePatterns(failures) {
    const patterns = [];
    const patternCounts = {};
    
    failures.forEach(failure => {
      const pattern = failure.category || 'unknown';
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    });
    
    Object.entries(patternCounts).forEach(([pattern, count]) => {
      if (count >= 2) { // 出现2次以上的模式认为是显著模式
        patterns.push({
          pattern,
          frequency: count,
          severity: count >= 5 ? 'high' : 'medium'
        });
      }
    });
    
    return patterns;
  }

  async identifySystemBottlenecks(target, progress) {
    const bottlenecks = [];
    
    // 检查资源瓶颈
    const resourceUsage = await this.getResourceUsage();
    if (resourceUsage.cpu > 90 || resourceUsage.memory > 80) {
      bottlenecks.push({
        type: 'resource',
        description: 'High resource usage',
        impact: 'medium',
        mitigation: 'Optimize resource allocation'
      });
    }
    
    // 检查技能可用性
    const requiredSkills = this.getRequiredSkills(target);
    const unavailableSkills = requiredSkills.filter(skill => !this.skills.has(skill));
    if (unavailableSkills.length > 0) {
      bottlenecks.push({
        type: 'dependency',
        description: `Missing required skills: ${unavailableSkills.join(', ')}`,
        impact: 'high',
        mitigation: 'Implement missing skills'
      });
    }
    
    return bottlenecks;
  }

  getRequiredSkills(target) {
    const skillRequirements = {
      'self_programming': ['code_generation', 'code_analysis', 'testing'],
      'tool_creation': ['api_integration', 'data_processing', 'automation'],
      'error_self_repair': ['error_detection', 'debugging', 'patch_generation']
    };
    
    return skillRequirements[target] || [];
  }

  async generateTargetPlan(target, analysis) {
    const plan = {
      target,
      timestamp: new Date().toISOString(),
      status: 'pending_confirmation',
      expectedBenefits: this.calculateExpectedBenefits(target),
      implementationSteps: [],
      testMethods: [],
      rollbackPlan: this.generateRollbackPlan(target),
      riskAssessment: this.assessRisks(target, analysis),
      subGoals: []
    };
    
    // 基于分析生成实施步骤
    plan.implementationSteps = await this.generateImplementationSteps(target, analysis);
    
    // 生成测试方法
    plan.testMethods = this.generateTestMethods(target);
    
    // 分解目标为子目标
    plan.subGoals = await this.goalDecomposer.decompose(target, plan.implementationSteps);
    
    // 保守策略：保存计划等待确认
    plan.needsConfirmation = true;
    plan.confirmationDeadline = new Date(
      Date.now() + this.config.confirmationTimeout
    ).toISOString();
    
    return plan;
  }

  calculateExpectedBenefits(target) {
    const benefits = {
      'self_programming': [
        'Increased development speed by 300%',
        'Reduced manual coding effort',
        '24/7 development capability'
      ],
      'tool_creation': [
        'Automated tool generation',