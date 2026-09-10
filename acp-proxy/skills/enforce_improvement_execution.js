const fs = require('fs');
const path = require('path');

/**
 * 强制改进执行闭环技能
 * 消除"执行停滞陷阱"，确保每个cycle都有改进任务
 */
class EnforceImprovementExecution {
    constructor(config = {}) {
        // 配置开关
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        
        // 待办改进池
        this.improvementPool = [
            {
                type: 'self_fix',
                description: '分析一个未处理的observation',
                requirements: ['识别最近的observation', '分析其模式和影响', '记录分析结果'],
                commit_message: 'feat: 分析并处理一个未处理的observation'
            },
            {
                type: 'self_programming',
                description: '尝试优化一个现有函数的性能',
                requirements: ['识别性能瓶颈函数', '分析当前实现', '提出优化方案', '实施并测试'],
                commit_message: 'perf: 优化函数性能提升效率'
            },
            {
                type: 'self_fix',
                description: '为某个模块编写单元测试',
                requirements: ['选择测试覆盖不足的模块', '设计测试用例', '编写测试代码', '验证测试有效性'],
                commit_message: 'test: 为模块添加单元测试覆盖'
            },
            {
                type: 'self_fix',
                description: '清理并重构一段重复代码',
                requirements: ['识别重复代码模式', '提取共用逻辑', '重构实现', '保持功能一致性'],
                commit_message: 'refactor: 清理重复代码优化结构'
            },
            {
                type: 'self_programming',
                description: '实现一个自动化的错误处理机制',
                requirements: ['识别常见错误模式', '设计错误处理策略', '实现自动处理逻辑', '添加监控告警'],
                commit_message: 'feat: 实现自动化错误处理机制'
            }
        ];
        
        // 动态任务生成器
        this.dynamicGenerators = {
            '自省债务累积': this.generateDebtClearanceTask.bind(this),
            '重复错误': this.generateErrorResolutionTask.bind(this),
            '性能退化': this.generatePerformanceTask.bind(this)
        };
        
        this.logger = config.logger || console;
    }
    
    /**
     * 主执行方法 - 检查并强制执行改进
     * @param {string} lastCycleLogPath - 上一个cycle的日志路径
     * @param {object} currentPlan - 当前cycle的规划对象
     * @param {object} options - 额外选项
     * @returns {object} 更新后的规划对象和执行事件
     */