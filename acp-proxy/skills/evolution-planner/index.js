'use strict';

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// 配置常量
const DEFAULT_CONFIG = {
  planningInterval: 24 * 60 * 60 * 1000, // 24小时
  confirmationTimeout: 48 * 60 * 60 * 1000, // 48小时
  maxSubGoals: 10,
  knowledgeBasePath: './knowledge/evolution-plans.json',
  plansDir: './evolution-plans',
  progressDir: './progress-reports',
  observationAnalyzer: null, // 将注入
  selfIntrospect: null, // 将注入
  skillRegistry: null, // 将注入
  evaluationCriteria: {
    qualityThresholds: {
      accuracy: 0.85,
      reliability: 0.9,
      efficiency: 0.8
    },
    testStandards: {
      edgeCases: 10,
      failureModes: 5,
      loadTesting: true
    }
  }
};

// A/B测试框架类
class ABTestFramework {
  constructor(config = {}) {
    this.config = config;
    this.activeTests = new Map();
    this.testResults = new Map();
    this.controlGroups = new Map();
  }

  async createTest(testId, controlGroup, variantGroup, metrics) {
    const test = {
      id: testId,
      control: controlGroup,
      variant: variantGroup,
      metrics: metrics,
      status: 'pending',
      startTime: null,
      endTime: null,
      samples: [],
      results: {}
    };
    
    this.activeTests.set(testId, test);
    return test;
  }

  async executeTest(testId) {
    const test = this.activeTests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    
    test.status = 'running';
    test.startTime = Date.now();
    
    // 收集测试数据
    const controlData = await this.collectTestData(test.control);
    const variantData = await this.collectTestData(test.variant);
    
    test.samples = [...controlData, ...variantData];
    
    return test;
  }

  async collectTestData(group) {
    // 模拟数据收集，实际实现会注入真实测试
    return Array.from({ length: group.sampleSize || 30 }, (_, i) => ({
      groupId: group.id,
      sampleId: i,
      metrics: group.metrics.map(m => ({
        name: m,
        value: Math.random() * 100,
        timestamp: Date.now()
      }))
    }));
  }

  async analyzeResults(testId) {
    const test = this.activeTests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    
    const controlResults = this.calculateGroupStats(test.control.id, test.samples);
    const variantResults = this.calculateGroupStats(test.variant.id, test.samples);
    
    test.results = {
      control: controlResults,
      variant: variantResults,
      improvement: this.calculateImprovement(controlResults, variantResults),
      statisticalSignificance: this.calculateSignificance(controlResults, variantResults),
      winner: this.determineWinner(controlResults, variantResults)
    };
    
    test.status = 'completed';
    test.endTime = Date.now();
    
    this.testResults.set(testId, test);
    this.activeTests.delete(testId);
    
    return test.results;
  }

  calculateGroupStats(groupId, samples) {
    const groupSamples = samples.filter(s => s.groupId === groupId);
    const stats = {};
    
    if (groupSamples.length === 0) return stats;
    
    const metrics = groupSamples[0].metrics.map(m => m.name);
    
    metrics.forEach(metricName => {
      const values = groupSamples.flatMap(s => 
        s.metrics.filter(m => m.name === metricName).map(m => m.value)
      );
      
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
      
      stats[metricName] = {
        average: avg,
        variance: variance,
        standardDeviation: Math.sqrt(variance),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      };
    });
    
    return stats;
  }

  calculateImprovement(control, variant) {
    const improvements = {};
    
    Object.keys(control).forEach(metric => {
      if (control[metric] && variant[metric]) {
        const improvement = ((variant[metric].average - control[metric].average) / control[metric].average) * 100;
        improvements[metric] = improvement;
      }
    });
    
    return improvements;
  }

  calculateSignificance(control, variant) {
    // 简化的统计显著性计算
    const significance = {};
    
    Object.keys(control).forEach(metric => {
      if (control[metric] && variant[metric]) {
        const tStat = Math.abs(
          (variant[metric].average - control[metric].average) /
          Math.sqrt(control[metric].variance + variant[metric].variance)
        );
        
        significance[metric] = {
          tStatistic: tStat,
          pValue: 1 / (1 + Math.exp(tStat)), // 简化的p值计算
          isSignificant: tStat > 1.96 // 95%置信度
        };
      }
    });
    
    return significance;
  }

  determineWinner(control, variant) {
    let controlScore = 0;
    let variantScore = 0;
    
    Object.keys(control).forEach(metric => {
      if (control[metric] && variant[metric]) {
        if (variant[metric].average > control[metric].average) {
          variantScore++;
        } else {
          controlScore++;
        }
      }
    });
    
    return variantScore > controlScore ? 'variant' : 'control';
  }
}

class EvolutionPlanner extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentGoals = [];
    this.plans = new Map();
    this.progressHistory = [];
    this.isPlanning = false;
    this.initialized = false;
    this.failureSamples = [];
    this.abTestFramework = new ABTestFramework(this.config);
    
    // 绑定方法
    this.checkProgress = this.checkProgress.bind(this);
    this.generatePlan = this.generatePlan.bind(this);
    this.confirmPlan = this.confirmPlan.bind(this);
    this.analyzeObservations = this.analyzeObservations.bind(this);
  }

  async initialize() {
    try {
      // 确保目录存在
      await this.ensureDirectories();
      
      // 加载现有计划和进度
      await this.loadExistingData();
      
      // 设置定时规划
      this.planningTimer = setInterval(this.checkProgress, this.config.planningInterval);