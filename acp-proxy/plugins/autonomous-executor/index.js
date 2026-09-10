const { VM } = require('vm');
const fs = require('fs');
const path = require('path');

class AutonomousExecutorPlugin {
    constructor() {
        this.logs = [];
        this.sandbox = new VM({
            timeout: 5000,
            sandbox: {}
        });
    }

    async execute(improvement) {
        const startTime = Date.now();
        const taskDesc = improvement.description || 'No description provided';

        try {
            // 评估任务复杂度
            const taskAssessment = this.assessTaskComplexity(improvement);

            if (taskAssessment.complexity === 'low') {
                // 自主执行简单任务
                return await this.executeSimpleTask(improvement);
            } else {
                // 标记为需要partner介入
                this.logEvent(startTime, taskDesc, 'deferred_to_partner', {
                    reason: taskAssessment.reason,
                    complexity: taskAssessment.complexity
                });
                return {
                    status: 'requires_partner_execution',
                    reason: taskAssessment.reason,
                    logs: this.getLogs()
                };
            }
        } catch (error) {
            this.logEvent(startTime, taskDesc, 'autonomous_fail', {
                error: error.message,
                stack: error.stack
            });
            return {
                status: 'autonomous_fail',
                error: error.message,
                logs: this.getLogs()
            };
        }
    }

    assessTaskComplexity(improvement) {
        const text = `${improvement.description} ${improvement.requirements}`.toLowerCase();
        const lowRiskKeywords = [
            '修改', '更新', '添加一个', '配置文件', '常量', '日志',
            '修改配置文件', '更新一个字符串常量', '添加一个日志输出',
            'change config', 'update constant', 'add log'
        ];

        const highRiskKeywords = [
            '架构', '重构', '算法', '数据库', '安全性', '性能优化',
            'architecture', 'refactor', 'algorithm', 'database', 'security', 'performance'
        ];

        let lowRiskScore = 0;
        let highRiskScore = 0;

        // 检查低风险关键词
        lowRiskKeywords.forEach(keyword => {
            if (text.includes(keyword)) lowRiskScore++;
        });

        // 检查高风险关键词
        highRiskKeywords.forEach(keyword => {
            if (text.includes(keyword)) highRiskScore++;
        });

        // 评估逻辑：如果有高风险关键词，标记为复杂任务
        if (highRiskScore > 0 || text.includes('架构变更')) {
            return {
                complexity: 'high',
                reason: '任务包含架构变更或高风险关键词'
            };
        }

        // 如果只有低风险关键词，检查描述长度
        if (lowRiskScore > 0 && text.length < 200) {
            return {
                complexity: 'low',
                reason: '任务包含低风险关键词且描述简单'
            };
        }

        // 默认为复杂任务
        return {
            complexity: 'high',
            reason: '任务描述不够明确或复杂度评估失败'
        };
    }

    async executeSimpleTask(improvement) {
        const startTime = Date.now();
        const taskDesc = improvement.description;

        try {
            // 生成代码修改建议
            const diffPlan = this.generateDiffPlan(improvement);

            // 在沙箱中应用修改并验证
            const validationResult = await this.applyAndValidate(diffPlan, improvement);

            if (validationResult.success) {
                this.logEvent(startTime, taskDesc, 'autonomous_success', {
                    diffPlan,
                    validation: validationResult
                });

                return {
                    status: 'autonomous_success',
                    plan: diffPlan,
                    validation: validationResult,
                    logs: this.getLogs()
                };
            } else {
                throw new Error(`Validation failed: ${validationResult.error}`);
            }
        } catch (error) {
            this.logEvent(startTime, taskDesc, 'autonomous_fail', {
                error: error.message
            });

            return {
                status: 'autonomous_fail',
                error: error.message,
                logs: this.getLogs()
            };
        }
    }

    generateDiffPlan(improvement) {
        const desc = improvement.description;
        const req = improvement.requirements;

        // 根据任务描述生成模拟的diff
        if (desc.includes('配置文件') || desc.includes('config')) {
            return {
                type: 'config_change',
                file: 'config.json',
                changes: [
                    {
                        key: 'updated_at',
                        oldValue: '2024-01-01',
                        newValue: new Date().toISOString().split('T')[0]
                    }
                ]
            };
        } else if (desc.includes('常量') || desc.includes('constant')) {
            return {
                type: 'constant_update',
                file: 'constants.js',
                changes: [
                    {
                        constant: 'VERSION',
                        oldValue: '1.0.0',
                        newValue: '1.0.1'
                    }
                ]
            };
        } else if (desc.includes('日志') || desc.includes('log')) {
            return {
                type: 'log_addition',
                file: 'utils.js',
                changes: [