const { getLogger } = require('../utils/logger');
const { getSystemState, setSystemState } = require('../system/state');
const { getObservationData } = require('../system/observation_data');
const { searchMemories, addMemory } = require('../memory/store');
const { CATEGORIES, CATEGORY_KEYWORDS } = require('../constants');

const logger = getLogger('observation-analyzer');

class ObservationAnalyzer {
  constructor() {
    this.isProcessing = false;
  }

  async analyzeObservations() {
    if (this.isProcessing) {
      logger.info('Analysis already in progress, skipping...');
      return false;
    }

    this.isProcessing = true;
    
    try {
      const counter = getSystemState('observations_unanalyzed') || 0;
      
      if (counter < 1) {
        this.isProcessing = false;
        return false;
      }

      logger.info(`Starting observation analysis. Found ${counter} unanalyzed observations.`);

      const observations = await getObservationData();
      
      if (!observations || observations.length === 0) {
        logger.warn('No observation data found to analyze.');
        this.isProcessing = false;
        return false;
      }

      const analysisResults = await this._processObservations(observations);
      
      if (analysisResults.length > 0) {
        await this._storeResults(analysisResults);
        setSystemState('observations_unanalyzed', 0);
        logger.info(`Analysis completed. Processed ${analysisResults.length} observations.`);
      } else {
        logger.warn('No observations were successfully processed.');
      }

      this.isProcessing = false;
      return true;
    } catch (error) {
      logger.error(`Analysis failed: ${error.message}`);
      this.isProcessing = false;
      return false;
    }
  }

  async _processObservations(observations) {
    const results = [];
    
    for (const observation of observations) {
      try {
        const category = this._categorizeObservation(observation);
        const relatedMemories = await this._findRelatedMemories(observation, category);
        
        const result = {
          timestamp: observation.timestamp || new Date().toISOString(),
          category: category,
          content: observation.content || '',
          observationId: observation.id,
          relatedMemoryIds: relatedMemories.map(m => m.id),
          summary: this._generateSummary(observation, category, relatedMemories)
        };

        results.push(result);
      } catch (error) {
        logger.error(`Failed to process observation ${observation.id}: ${error.message}`);
      }
    }

    return results;
  }

  _categorizeObservation(observation) {
    const content = (observation.content || '').toLowerCase();
    
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return category;
      }
    }
    
    return CATEGORIES.INFO;
  }

  async _findRelatedMemories(observation, category) {
    try {
      const searchCriteria = {
        type: 'observation',
        category: category,
        timeRange: {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString()
        }
      };

      if (observation.keywords && observation.keywords.length > 0) {
        searchCriteria.keywords = observation.keywords;
      }

      const memories = await searchMemories(searchCriteria);
      return memories.slice(0, 5);
    } catch (error) {
      logger.warn(`Memory search failed for observation ${observation.id}: ${error.message}`);
      return [];
    }
  }

  _generateSummary(observation, category, relatedMemories) {
    const observationType = category === CATEGORIES.ERROR ? '错误' :
                          category === CATEGORIES.WARNING ? '警告' : '信息';
    
    let summary = `${observationType}: ${observation.content ? observation.content.substring(0, 100) : '无内容'}`;
    
    if (relatedMemories.length > 0) {
      summary += ` | 关联记忆: ${relatedMemories.length}条`;
    }
    
    return summary;
  }

  async _storeResults(results) {
    for (const result of results) {
      try {
        const memoryEntry = {
          id: `obs_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation_analysis',
          category: result.category,
          content: result.summary,
          timestamp: result.timestamp,
          metadata: {
            observationId: result.observationId,
            relatedMemoryIds: result.relatedMemoryIds,
            analysisVersion: '1.0'
          }
        };

        await addMemory(memoryEntry);
      } catch (error) {
        logger.error(`Failed to store analysis result for observation ${result.observationId}: ${error.message}`);
      }
    }
  }
}

const analyzer = new ObservationAnalyzer();

module.exports = {
  analyzeObservations: () => analyzer.analyzeObservations(),
  ObservationAnalyzer
};