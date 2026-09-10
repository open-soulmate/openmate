// acp-proxy/skills/observation_analyzer.js
const logger = require('../utils/logger');
const { getSystemState, updateSystemState } = require('../utils/systemState');
const { getObservationData } = require('../data/observationDataSource');
const memoryStore = require('../memory/memoryStore');

/**
 * Observations Analyzer Skill
 * Monitors and processes unanalyzed observation data for error self-healing
 */
class ObservationAnalyzer {
    constructor() {
        this.skillName = 'observation_analyzer';
    }

    /**
     * Main analysis function - exported as module entry point
     * @returns {Promise<Object>} Analysis results and status
     */
    async analyzeObservations() {
        try {
            // Check if analysis is needed
            const systemState = await getSystemState();
            const unanalyzedCount = systemState.observations_unanalyzed || 0;
            
            if (unanalyzedCount < 1) {
                return { 
                    status: 'skipped', 
                    reason: 'No unanalyzed observations',
                    timestamp: new Date().toISOString()
                };
            }

            logger.info(`[${this.skillName}] Processing ${unanalyzedCount} unanalyzed observations`);

            // Get observation data
            const observations = await getObservationData(unanalyzedCount);
            
            if (!observations || observations.length === 0) {
                logger.warn(`[${this.skillName}] No observation data retrieved`);
                return { 
                    status: 'failed', 
                    reason: 'No observation data available',
                    timestamp: new Date().toISOString()
                };
            }

            // Process each observation
            const analysisResults = [];
            
            for (const observation of observations) {
                try {
                    const result = await this.processObservation(observation);
                    analysisResults.push(result);
                } catch (error) {
                    logger.error(`[${this.skillName}] Failed to process observation: ${error.message}`);
                    analysisResults.push({
                        status: 'failed',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Store analysis results in memory
            await this.storeAnalysisResults(analysisResults);

            // Reset counter
            await updateSystemState({ observations_unanalyzed: 0 });

            logger.info(`[${this.skillName}] Analysis completed: ${analysisResults.length} observations processed`);

            return {
                status: 'success',
                processedCount: analysisResults.length,
                results: analysisResults,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error(`[${this.skillName}] Analysis process failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process a single observation
     * @param {Object} observation - Raw observation data
     * @returns {Promise<Object>} Processed observation with classification and associations
     */
    async processObservation(observation) {
        const { id, content, timestamp, source } = observation;
        
        // Step 1: Classify observation
        const classification = this.classifyObservation(content);
        
        // Step 2: Find related memories
        const relatedMemories = await this.findRelatedMemories(
            content, 
            classification.type, 
            timestamp
        );
        
        // Step 3: Generate summary
        const summary = this.generateSummary(
            id, 
            content, 
            classification, 
            relatedMemories
        );
        
        return {
            observationId: id,
            classification,
            relatedMemoryIds: relatedMemories.map(m => m.id),
            summary,
            processedAt: new Date().toISOString(),
            status: 'analyzed'
        };
    }

    /**
     * Classify observation based on content
     * @param {string} content - Observation content
     * @returns {Object} Classification result
     */
    classifyObservation(content) {
        const contentLower = content.toLowerCase();
        
        // Classification rules
        const classificationRules = [
            {
                type: 'error',
                patterns: ['error', 'exception', 'failure', 'failed', 'crash', 'critical']
            },
            {
                type: 'warning',
                patterns: ['warning', 'warn', 'alert', 'caution', 'potential issue']
            },
            {
                type: 'info',
                patterns: ['info', 'information', 'notice', 'log', 'data']
            },
            {
                type: 'debug',
                patterns: ['debug', 'trace', 'diagnostic']
            }
        ];
        
        for (const rule of classificationRules) {
            if (rule.patterns.some(pattern => contentLower.includes(pattern))) {
                return {
                    type: rule.type,
                    confidence: 0.8,
                    matchedPatterns: rule.patterns.filter(p => contentLower.includes(p))
                };
            }
        }
        
        // Default classification
        return {
            type: 'unclassified',
            confidence: 0.5,
            matchedPatterns: []
        };
    }

    /**
     * Find related memories in the memory store
     * @param {string} content - Observation content
     * @param {string} type - Observation type
     * @param {string} timestamp - Observation timestamp
     * @returns {Promise<Array>} Related memory entries
     */
    async findRelatedMemories(content, type, timestamp) {
        try {
            // Extract keywords from content
            const keywords = this.extractKeywords(content);
            
            // Query memory store
            const query = {
                $or: [
                    { keywords: { $in: keywords } },
                    { type: type },
                    { timestamp: { $gte: new Date(timestamp) - 24 * 60 * 60 * 1000 } } // Last 24 hours
                ],
                limit: 5
            };
            
            return await memoryStore.query(query);
        } catch (error) {
            logger.error(`[${this.skillName}] Memory query failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract keywords from content
     * @param {string} content - Text content
     * @returns {Array<string>} Extracted keywords
     */
    extractKeywords(content) {
        // Simple keyword extraction - could be enhanced with NLP
        const words = content.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        // Remove common stop words
        const stopWords = ['this', 'that', 'with', 'have', 'from', 'they', 'been', 'said', 'each', 'which'];
        return [...new Set(words.filter(word => !stopWords.includes(word)))].slice(0, 10);
    }

    /**
     * Generate analysis summary
     * @param {string} id - Observation ID