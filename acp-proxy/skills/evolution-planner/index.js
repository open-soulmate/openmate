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
  reporter: null, // 新增：报告器注入点
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
    const metricValues = {};
    
    groupSamples.forEach(sample => {
      sample.metrics.forEach(metric => {
        if (!metricValues[metric.name]) {
          metricValues[metric.name] = [];
        }
        metricValues[metric.name].push(metric.value);
      });
    });
    
    const stats = {};
    for (const [metric, values] of Object.entries(metricValues)) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      stats[metric] = {
        average: avg,
        min: min,
        max: max,
        stdDev: stdDev,
        samples: values.length
      };
    }
    
    return stats;
  }

  calculateImprovement(control, variant) {
    const improvements = {};
    
    for (const metric of Object.keys(control)) {
      if (variant[metric]) {
        const controlAvg = control[metric].average;
        const variantAvg = variant[metric].average;
        
        if (controlAvg !== 0) {
          improvements[metric] = ((variantAvg - controlAvg) / controlAvg) * 100;
        } else {
          improvements[metric] = variantAvg > 0 ? Infinity : 0;
        }
      }
    }
    
    return improvements;
  }

  calculateSignificance(control, variant) {
    // 简化版的统计显著性计算
    const significance = {};
    
    for (const metric of Object.keys(control)) {
      if (variant[metric]) {
        const controlSamples = control[metric].samples;
        const variantSamples = variant[metric].samples;
        const controlStdDev = control[metric].stdDev;
        const variantStdDev = variant[metric].stdDev;
        
        // 使用简化版的t检验
        const pooledStdDev = Math.sqrt(
          (Math.pow(controlStdDev, 2) + Math.pow(variantStdDev, 2)) / 2
        );
        
        const standardError = pooledStdDev * Math.sqrt(1/controlSamples + 1/variantSamples);
        const tStatistic = Math.abs(control[metric].average - variant[metric].average) / standardError;
        
        // 简化的p值估计（实际应用中应使用t分布表）
        const pValue = 0.05