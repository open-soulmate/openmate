/**
 * analyze-observations-skill.js
 * 
 * 核心技能：分析记忆库中未处理的观察记录，生成结构化分析结论和行动建议。
 * 这是打破“进化循环停滞”、建立“观察-分析-行动”闭环的关键技能。
 * 
 * 职责：
 * 1. 从记忆库读取状态为 `unanalyzed` 的观察记录。
 * 2. 对每条记录进行语义理解和模式识别。
 * 3. 生成分析报告，关联进化目标，提出改进建议。
 * 4. 更新已分析记录的状态，并将报告存入记忆库。
 * 5. 提供一个内联的统计分析微工具作为创造实例。
 * 
 * 依赖：
 * - acp-proxy/plugins/memory-plugin.js
 * 
 * 接口：
 * - `async function execute()` -> 返回操作结果对象。
 * 
 * @module analyze-observations-skill
 */

// 导入依赖的插件（路径基于项目结构假设）
const memoryPlugin = await import('../plugins/memory-plugin.js');

// 为了代码清晰和模块化，将分析逻辑封装为一个独立的类
class ObservationAnalyzer {
    /**
     * 创建观察分析器实例。
     * @param {object} plugin - 记忆插件实例，提供数据读写方法。
     */
    constructor(plugin) {
        if (!plugin) {
            throw new Error('记忆插件实例不能为空。');
        }
        this.plugin = plugin;
        // 内联一个简单的统计分析工具，作为微小工具创造的实例
        this.statisticalAnalyzer = this.createStatisticalAnalyzer();
    }

    /**
     * 执行完整的观察分析流程。
     * @returns {Promise<object>} 包含执行结果的对象。
     */
    async execute() {
        const result = {
            success: false,
            analyzedCount: 0,
            reportId: null,
            stats: null,
            errors: []
        };

        try {
            // 1. 获取未分析的观察记录
            const unanalyzedObservations = await this.fetchUnanalyzedObservations();
            if (unanalyzedObservations.length === 0) {
                result.success = true;
                result.stats = { message: '没有需要分析的观察记录。' };
                return result;
            }

            // 2. 对每条记录进行分析，并收集结果
            const analysisResults = [];
            for (const observation of unanalyzedObservations) {
                try {
                    const analysis = await this.analyzeSingleObservation(observation);
                    analysisResults.push({
                        observationId: observation.id,
                        analysis: analysis
                    });
                } catch (error) {
                    // 单条记录分析失败不应中断整个流程，记录错误并继续
                    result.errors.push({
                        observationId: observation.id,
                        error: error.message
                    });
                    console.warn(`分析观察记录 ${observation.id} 时出错:`, error.message);
                }
            }

            // 3. 批量更新观察记录状态
            const updateResults = await this.updateObservationsStatus(analysisResults);
            result.analyzedCount = updateResults.updatedCount;

            // 4. 生成并存储分析报告
            const report = this.generateReport(unanalyzedObservations, analysisResults, result.errors);
            result.reportId = await this.storeAnalysisReport(report);

            // 5. 执行内联的统计分析
            result.stats = this.statisticalAnalyzer.analyze(unanalyzedObservations);

            result.success = true;

        } catch (error) {
            // 处理整个流程中的关键错误
            result.errors.push({ error: error.message });
            console.error('观察分析流程执行失败:', error);
        }

        return result;
    }

    /**
     * 从记忆库获取状态为 `unanalyzed` 的观察记录。
     * @returns {Promise<Array>} 观察记录数组。
     */
    async fetchUnanalyzedObservations() {
        try {
            // 调用记忆插件的 get_observations 方法，筛选状态
            const observations = await this.plugin.get_observations({
                status: 'unanalyzed'
            });
            // 确保返回的是数组，并对每条记录的基本格式进行验证
            if (!Array.isArray(observations)) {
                throw new Error('记忆插件返回的观察数据格式无效，期望为数组。');
            }
            return observations.filter(obs => this.validateObservation(obs));
        } catch (error) {
            throw new Error(`获取未分析观察记录失败: ${error.message}`);
        }
    }

    /**
     * 验证单条观察记录的基本结构。
     * @param {object} observation - 观察记录对象。
     * @returns {boolean} 是否有效。
     */
    validateObservation(observation) {
        if (!observation || typeof observation !== 'object') {
            console.warn('发现无效的观察记录对象，已跳过:', observation);
            return false;
        }
        if (!observation.id) {
            console.warn('发现缺少 id 的观察记录，已跳过:', observation);
            return false;
        }
        if (!observation.content || typeof observation.content !== 'string') {
            console.warn(`观察记录 ${observation.id} 内容缺失或格式错误，已跳过。`);
            return false;
        }
        // 可以添加更多字段验证，如 timestamps, source 等
        return true;
    }

    /**
     * 分析单条观察记录，生成结构化分析结论。
     * 这是核心的语义理解和模式识别逻辑所在。
     * 当前实现为基于规则和模板的启发式分析，可未来升级为调用LLM。
     * @param {object} observation - 一条观察记录。
     * @returns {Promise<object>} 分析结果对象。
     */
    async analyzeSingleObservation(observation) {
        const content = observation.content;
        const analysis = {
            identifiedPatterns: [],
            relatedGoals: [],
            suggestedActions: [],
            summary: ''
        };

        // 示例：简单的关键词模式识别
        // 这是一个可自我优化的模块化组件
        const patternRules = [
            { keywords: ['错误', '失败', '异常', 'error', 'failed', 'exception'], pattern: 'ERROR_PATTERN', goal: 'error_self_repair' },
            { keywords: ['性能', '速度', '慢', 'performance', 'slow'], pattern: 'PERFORMANCE_ISSUE', goal: 'performance_optimization' },
            { keywords: ['用户', '请求', '反馈', 'user', 'request', 'feedback'], pattern: 'USER_FEEDBACK', goal: 'user_experience' },
            { keywords: ['记忆', '数据', '存储', 'memory', 'data', 'storage'], pattern: 'MEMORY_ISSUE', goal: 'memory_management' },
            { keywords: ['创建', '新', '工具', 'create', 'new', 'tool'], pattern: 'TOOL_CREATION_OPPORTUNITY', goal: 'tool_creation' }
        ];

        // 模式匹配
        for (const rule of patternRules) {
            if (rule.keywords.some(keyword => content.toLowerCase().includes(keyword))) {
                analysis.identifiedPatterns.push(rule.pattern);
                if (!analysis.relatedGoals.includes(rule.goal)) {
                    analysis.relatedGoals.push(rule.goal);
                }
            }
        }

        // 如果没有匹配到特定模式，标记为通用观察
        if (analysis.identifiedPatterns.length === 0) {
            analysis.identifiedPatterns.push('GENERAL_OBSERVATION');
            analysis.relatedGoals.push('general_awareness');
        }

        // 生成建议的行动（示例）
        const goalActionMap = {
            'error_self_repair': '建议：检查相关代码路径，添加更详细的错误日志或回退机制。',
            'performance_optimization': '建议：分析性能瓶颈点，考虑缓存、异步处理或算法优化。',
            'user_experience': '建议：梳理用户交互流程，优化提示信息或增加容错处理。',