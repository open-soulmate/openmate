const fs = require('fs');
const path = require('path');

/**
 * 强制性改进执行闭环技能
 * 目的：根除执行停滞陷阱，作为进化循环的看门人
 */
class EnforceImprovementExecution {
    constructor(config = {}) {
        this.enabled = config.enabled !== false; // 默认启用
        this.logPath = config.logPath || path.join(__dirname, '../plugins/evolution-engine/logs');
        this.improvementPool = config.improvementPool || this.getDefaultImprovementPool();
        this.failurePatternMap = config.failurePatternMap || this.getDefaultFailurePatternMap();
    }

    /**
     * 获取默认的待办改进池
     */
    getDefaultImprovementPool() {
        return [
            {
                type: 'self_fix',
                description: '分析一个未处理的observation',
                requirements: '选择一个未分析的observation进行深入分析，生成洞察报告',
                commit_message: 'feat: 分析未处理的observation'
            },
            {
                type: 'self_programming',