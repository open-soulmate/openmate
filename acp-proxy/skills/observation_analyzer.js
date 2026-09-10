/**
 * Skill: observation_analyzer
 * Description: Monitors observations_unanalyzed counter and processes backlog of observation data
 */

const logger = require('../utils/logger');
const memoryStore = require('../services/memoryService');
const observationDataSource = require('../services/observationService');

// Simple classification rules
const CLASSIFICATION_RULES = {
  error: ['error', 'exception', 'failure', 'failed', 'crash', 'critical'],
  warning: ['warning', 'warn', 'caution', 'alert'],
  info: ['info', 'information', 'debug', 'trace', 'log']
};

class ObservationAnalyzer {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * Classify observation based on content keywords
   * @param {string} content - Observation content
   * @returns {string} Classification type
   */
  classifyObservation(content) {
    const contentLower = content.toLowerCase();
    
    for (const [type, keywords] of Object.entries(CLASSIFICATION_RULES)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        return type;
      }
    }
    
    return 'unknown';
  }

  /**
   * Find related memories based on observation context
   * @param {Object} observation - Observation data
   * @returns {Promise<Array>} Related memory IDs
   */
  async findRelatedMemories(observation) {
    try {
      const searchQuery = {
        $or: [
          { timestamp: { $gte: observation.timestamp - 3600000 } }, // Within last hour
          { type: observation.type },
          { content: { $regex: new RegExp(observation.keywords.join('|'), 'i') } }
        ]
      };
      
      const relatedMemories = await memoryStore.search(searchQuery);
      return relatedMemories.map(memory => memory.id);
    } catch (error) {
      logger.warn('Failed to find related memories', { error: error.message });
      return [];
    }
  }

  /**
   * Generate analysis summary for observation
   * @param {Object} observation - Observation data
   * @param {Array} relatedMemoryIds - Related memory IDs
   * @param {string} classification - Observation classification
   * @returns {Object} Analysis summary
   */
  generateSummary(observation, relatedMemoryIds, classification) {
    return {
      observationId: observation.id,
      classification,
      relatedMemoryIds,
      timestamp: new Date().toISOString(),
      summary: `${classification.toUpperCase()}: ${observation.content.substring(0, 100)}...`,
      metadata: {
        source: observation.source,
        severity: observation.severity || 'medium'
      }
    };
  }

  /**
   * Main analysis function - processes observation backlog
   * @param {Object} systemState - System state containing observations_unanalyzed
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeObservations(systemState = {}) {
    // Prevent concurrent execution
    if (this.isProcessing) {
      logger.info('Observation analysis already in progress, skipping');
      return { status: 'skipped', reason: 'already_processing' };
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Check if there are observations to analyze
      const unanalyzedCount = systemState.observations_unanalyzed || 
                             (await this.getUnanalyzedCount()) || 0;
      
      if (unanalyzedCount < 1) {
        this.isProcessing = false;
        return { status: 'completed', analyzed: 0 };
      }

      logger.info(`Starting observation analysis for ${unanalyzedCount} items`);

      // Get unanalyzed observations
      const observations = await observationDataSource.getUnanalyzed();
      
      if (!observations || observations.length === 0) {
        logger.warn('No observations found despite non-zero counter');
        this.isProcessing = false;
        return { status: 'completed', analyzed: 0 };
      }

      const results = [];
      let processedCount = 0;

      // Process each observation
      for (const observation of observations) {
        try {
          // Step 1: Classify observation
          const classification = this.classifyObservation(observation.content);
          
          // Step 2: Find related memories
          const relatedMemoryIds = await this.findRelatedMemories(observation);
          
          // Step 3: Generate analysis summary
          const summary = this.generateSummary(observation, relatedMemoryIds, classification);
          
          // Step 4: Store in memory
          const memoryId = await memoryStore.add({
            type: 'observation_analysis',
            content: summary,
            timestamp: Date.now(),
            observationId: observation.id,
            classification
          });
          
          // Step 5: Mark observation as processed
          await observationDataSource.markAsProcessed(observation.id);
          
          results.push({
            observationId: observation.id,
            memoryId,
            classification,
            status: 'processed'
          });
          
          processedCount++;
          
        } catch (observationError) {
          logger.error('Failed to process individual observation', {
            error: observationError.message,
            observationId: observation.id
          });
          
          results.push({
            observationId: observation.id,
            status: 'failed',
            error: observationError.message
          });
        }
      }

      // Step 6: Reset counter if all observations processed
      if (processedCount === observations.length) {
        await this.resetUnanalyzedCounter();
      }

      const duration = Date.now() - startTime;
      logger.info(`Observation analysis completed in ${duration}ms`, {
        processed: processedCount,
        failed: observations.length - processedCount,
        total: observations.length
      });

      this.isProcessing = false;
      return {
        status: 'completed',
        analyzed: processedCount,
        failed: observations.length - processedCount,
        duration,
        results
      };

    } catch (error) {
      logger.error('Observation analysis failed', {
        error: error.message,
        stack: error.stack
      });
      