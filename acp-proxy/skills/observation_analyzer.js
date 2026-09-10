const systemState = require('../system/state');
const memoryStore = require('../memory/store');
const systemLogger = require('../utils/logger');
const observationSource = require('../data/observationSource');

const observation_analyzer = async () => {
  try {
    if (systemState.observations_unanalyzed < 1) {
      return;
    }
    
    const unanalyzedObservations = await observationSource.getUnanalyzedObservations();
    
    const analysisResults = [];
    for (const observation of unanalyzedObservations) {
      const category = categorizeObservation(observation.content);
      const relatedMemories = await memoryStore.search({
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        $or: [
          { type: category },
          { keywords: { $in: extractKeywords(observation.content) } }
        ]
      });
      
      const memoryIds = relatedMemories.map(m => m.id);
      const summary = generateSummary(observation, category, memoryIds);
      
      const analysisResult = {
        timestamp: new Date(),
        observationId: observation.id,
        category,
        relatedMemoryIds: memoryIds,
        summary,
        processedAt: new Date()
      };
      
      analysisResults.push(analysisResult);
    }
    
    for (const result of analysisResults) {
      await memoryStore.add({
        type: 'observation_analysis',
        ...result
      });
    }
    
    await systemState.update('observations_unanalyzed', 0);
    systemLogger.info(`Analyzed ${analysisResults.length} observations and reset counter`);
    
  } catch (error) {
    systemLogger.error(`Observation analysis failed: ${error.message}`);
    throw error;
  }
};

const categorizeObservation = (content) => {
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('error') || lowerContent.includes('fail')) return 'error';
  if (lowerContent.includes('warn')) return 'warning';
  return 'info';
};

const extractKeywords = (content) => {
  return content.split(/\W+/)
    .filter(word => word.length > 3)
    .slice(0, 10);
};

const generateSummary = (observation, category, memoryIds) => {
  return `${category.toUpperCase()}: ${observation.content.substring(0, 100)}... [${memoryIds.length} related memories]`;
};

module.exports = {
  analyzeObservations: observation_analyzer,
  trigger: observation_analyzer
};