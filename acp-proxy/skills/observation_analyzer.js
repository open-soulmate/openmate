const { logger, state, memoryStore, observationLog } = require('../system/core');
const { analyzeObservation, categorizeObservation, findRelatedMemories } = require('../system/analysis');

module.exports = {
    name: 'observation_analyzer',
    description: '自动处理观察数据积压，进行分析分类和关联记忆',
    version: '1.0.0',
    
    /**
     * 主分析函数 - 系统通过此接口调用技能
     * @returns {Promise<Object>} 分析结果对象
     */
    async analyzeObservations() {
        try {
            // 获取当前未分析观察数量
            const unanalyzedCount = state.get('observations_unanalyzed') || 0;
            
            if (unanalyzedCount < 1) {
                logger.info('observation_analyzer: 无积压观察数据，跳过分析');
                return { success: true, processed: 0, message: '无需处理' };
            }
            
            logger.info(`observation_analyzer: 检测到 ${unanalyzedCount} 条未分析观察，开始处理...`);
            
            // 获取未分析的观察数据
            const observations = await this.getUnanalyzedObservations(unanalyzedCount);
            
            if (!observations || observations.length === 0) {
                logger.warn('observation_analyzer: 获取观察数据失败或数据为空');
                return { success: false, error: '无法获取观察数据' };
            }
            
            // 批量处理观察数据
            const results = [];
            for (const observation of observations) {
                try {
                    const result = await this.processObservation(observation);
                    results.push(result);
                } catch (processError) {
                    logger.error(`observation_analyzer: 处理单个观察失败: ${processError.message}`, {
                        observationId: observation?.id,
                        error: processError.stack
                    });
                }
            }
            
            // 重置计数器
            state.set('observations_unanalyzed', 0);
            
            // 记录完成事件
            logger.info(`observation_analyzer: 成功处理 ${results.length}/${observations.length} 条观察数据`);
            
            return {
                success: true,
                processed: results.length,
                total: observations.length,
                results: results,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error(`observation_analyzer: 分析过程中发生错误: ${error.message}`, {
                error: error.stack,
                timestamp: Date.now()
            });
            
            // 错误时不重置计数器，保持原值以便重试
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    },
    
    /**
     * 获取未分析的观察数据
     * @param {number} count 需要获取的数量
     * @returns {Promise<Array>} 观察数据数组
     */
    async getUnanalyzedObservations(count) {
        try {
            // 从观察日志获取未分析数据（假设这些数据已标记为unanalyzed）
            const observations = await observationLog.getUnanalyzed({
                limit: count,
                sortOrder: 'asc' // 按时间顺序处理
            });
            
            return observations || [];
        } catch (error) {
            logger.error(`observation_analyzer: 获取观察数据失败: ${error.message}`);
            throw error;
        }
    },
    
    /**
     * 处理单个观察数据
     * @param {Object} observation 观察数据对象
     * @returns {Promise<Object>} 处理结果
     */
    async processObservation(observation) {
        const startTime = Date.now();
        
        // 1. 分类观察类型
        const category = categorizeObservation(observation);
        
        // 2. 关联历史记忆
        const relatedMemories = await this.findRelatedMemories(observation, category);
        
        // 3. 生成分析摘要
        const analysisResult = this.generateAnalysisSummary(observation, category, relatedMemories);
        
        // 4. 存储分析结果到记忆系统
        const memoryId = await this.storeToMemory(analysisResult);
        
        // 5. 标记原始观察为已分析
        await this.markObservationAsAnalyzed(observation.id, memoryId);
        
        const processingTime = Date.now() - startTime;
        
        logger.debug(`observation_analyzer: 处理完成观察 ${observation.id}`, {
            category,
            memoryId,
            processingTime: `${processingTime}ms`
        });
        
        return {
            observationId: observation.id,
            category,
            memoryId,
            processingTime
        };
    },
    
    /**
     * 查找相关记忆
     * @param {Object} observation 观察数据
     * @param {string} category 观察类别
     * @returns {Promise<Array>} 相关记忆数组
     */
    async findRelatedMemories(observation, category) {
        try {
            const query = {
                type: category,
                timeRange: {
                    from: new Date(observation.timestamp - 24 * 60 * 60 * 1000), // 前24小时
                    to: new Date(observation.timestamp + 60 * 60 * 1000) // 后1小时
                },
                keywords: this.extractKeywords(observation.content),
                limit: 5
            };
            
            const memories = await memoryStore.search(query);
            return memories || [];
        } catch (error) {
            logger.warn(`observation_analyzer: 查找相关记忆失败，继续处理: ${error.message}`);
            return [];
        }
    },
    
    /**
     * 从内容中提取关键词
     * @param {string} content 观察内容
     * @returns {Array} 关键词数组
     */
    extractKeywords(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }
        
        // 简单的关键词提取：取前20个非停用词单词
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
        
        const words = content
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word));
        
        return [...new Set(words)].slice(0, 20);
    },
    
    /**
     * 生成分析摘要
     * @param {Object} observation 观察数据
     * @param {string} category 观察类别
     * @param {Array} relatedMemories 相关记忆
     * @returns {Object} 分析结果对象
     */