'use strict';

/**
 * Observation Analyzer Skill
 * 
 * Monitors `observations_unanalyzed` counter and triggers analysis pipeline
 * when count >= 1. Includes data fetching, classification, memory association,
 * result storage, and counter reset with comprehensive error handling.
 */

// Assume system APIs are available globally or will be injected
// These would be provided by the acp-proxy framework
const system = {
    getCounter: (name) => {
        // Placeholder - in real implementation, fetch from system state
        return 0;
    },
    setCounter: (name, value) => {
        // Placeholder - in real implementation, update system state
    },
    getObservations: () => {
        // Placeholder - returns array of unanalyzed observation objects
        return [];
    },
    logger: {
        info: (message, meta) => console.log(`[INFO] ${message}`, meta || ''),
        warn: (message, meta) => console.warn(`[WARN] ${message}`, meta || ''),
        error: (message, meta) => console.error(`[ERROR] ${message}`, meta || '')
    }
};

// Memory store interface (would be provided by acp-proxy framework)
const memoryStore = {
    search: async (query) => {
        // Placeholder - returns matching memory entries
        return [];
    },
    add: async (memory) => {
        // Placeholder - stores memory and returns stored entry
        return memory;
    }
};

// Classification rules based on content analysis
const classificationRules = [
    { pattern: /error|exception|fail|crash|critical/i, type: 'error' },
    { pattern: /warning|warn|alert|caution/i, type: 'warning' },
    { pattern: /info|notice|log|debug/i, type: 'info' },
    { pattern: /performance|slow|timeout|latency/i, type: 'performance' },
    { pattern: /security|auth|permission|access/i, type: 'security' }
];

/**
 * Classifies observation based on content keywords
 * @param {Object} observation - The observation data
 * @returns {string} Classification type
 */
function classifyObservation(observation) {
    if (!observation || !observation.content) {
        return 'unknown';
    }
    
    const content = typeof observation.content === 'string' 
        ? observation.content 
        : JSON.stringify(observation.content);
    
    for (const rule of classificationRules) {
        if (rule.pattern.test(content)) {
            return rule.type;
        }
    }
    
    return 'info'; // Default classification
}

/**
 * Searches for related memories based on observation characteristics
 * @param {Object} observation - The observation data
 * @param {string} classification - The observation type
 * @returns {Promise<Array>} Related memory entries
 */
async function findRelatedMemories(observation, classification) {
    try {
        // Build search query based on observation properties
        const searchCriteria = {
            type: classification,
            timestamp: {
                // Look for memories within ±1 hour of observation
                $gte: new Date(Date.now() - 3600000),
                $lte: new Date()
            }
        };
        
        // If observation has keywords, search by content
        if (observation.keywords && Array.isArray(observation.keywords)) {
            searchCriteria.$text = { $search: observation.keywords.join(' ') };
        }
        
        return await memoryStore.search(searchCriteria);
    } catch (error) {
        system.logger.warn('Failed to search related memories', { 
            error: error.message,
            observationId: observation.id 
        });
        return [];
    }
}

/**
 * Generates analysis summary for storage
 * @param {Object} observation - Original observation
 * @param {string} classification - Classified type
 * @param {Array} relatedMemories - Found related memories
 * @returns {Object} Analysis result ready for storage
 */
function createAnalysisSummary(observation, classification, relatedMemories) {
    const summary = {
        observationId: observation.id || Date.now().toString(),
        timestamp: new Date(),
        type: classification,
        originalContent: observation.content,
        relatedMemoryIds: relatedMemories.map(m => m.id).filter(Boolean),
        analysis: {
            confidence: relatedMemories.length > 0 ? 'high' : 'low',
            patternCount: relatedMemories.length,
            description: `Observation classified as ${classification} with ${relatedMemories.length} related memories found`
        }
    };
    
    // Add keywords if available
    if (observation.keywords) {
        summary.keywords = observation.keywords;
    }
    
    return summary;
}

/**
 * Main analysis function - processes observation backlog
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeObservations() {
    const counterName = 'observations_unanalyzed';
    const startTime = Date.now();
    
    system.logger.info('Starting observation analysis check');
    
    try {
        // Check if there are unanalyzed observations
        const unanalyzedCount = system.getCounter(counterName);
        
        if (unanalyzedCount < 1) {
            system.logger.info('No unanalyzed observations to process');
            return { processed: 0, skipped: true };
        }
        
        system.logger.info(`Found ${unanalyzedCount} unanalyzed observations`);
        
        // Fetch unanalyzed observations
        const observations = system.getObservations();
        
        if (!observations || observations.length === 0) {
            system.logger.warn('Observations counter indicates data but none retrieved');
            return { processed: 0, skipped: false, reason: 'no_data' };
        }
        
        const results = [];
        
        // Process each observation
        for (const observation of observations) {
            try {
                // Classify the observation
                const classification = classifyObservation(observation);
                
                // Find related memories
                const relatedMemories = await findRelatedMemories(observation, classification);
                
                // Create analysis summary
                const summary = createAnalysisSummary(observation, classification, relatedMemories);
                
                // Store analysis result in memory
                const storedMemory = await memoryStore.add({
                    type: 'observation_analysis',
                    content: summary,
                    metadata: {
                        processedAt: new Date(),
                        processingTime: Date.now() - startTime
                    }
                });
                
                results.push({
                    observationId: observation.id,
                    classification,
                    memoryId: storedMemory.id,
                    relatedCount: relatedMemories.length,
                    success: true
                });
                
                system.logger.info(`Processed observation ${observation.id}`, {
                    classification,
                    relatedMemories: relatedMemories.length
                });
                
            } catch (obsError) {
                system.logger.error(`Failed to process observation ${observation.id}`, {
                    error: obsError.message,
                    stack: obsError.stack
                });
                
                results.push({
                    observationId: observation.id,
                    success: false,
                    error: obsError.message
                });
            }
        }
        
        // Reset counter only if all observations were processed successfully
        const allSuccess = results.every(r => r.success);
        
        if (allSuccess) {
            system.setCounter(counterName, 0);
            system.logger.info('Observation analysis completed successfully', {
                processedCount: results.length,