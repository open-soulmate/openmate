const systemState = require('../system_state');
const observationDataSource = require('../data_sources/observations');
const memoryStore = require('../memory/memory_store');
const systemLog = require('../utils/system_log');

async function analyzeObservations() {
    try {
        const unanalyzedCount = systemState.get('observations_unanalyzed');
        if (unanalyzedCount < 1) {
            return;
        }

        systemLog.log(`Starting analysis of ${unanalyzedCount} unanalyzed observations`, 'info');

        const observations = await observationDataSource.getUnanalyzed();
        if (!observations || observations.length === 0) {
            systemLog.log('No observation data found to analyze', 'warning');
            return;
        }

        const analysisResults = [];
        for (const observation of observations) {
            try {
                const category = classifyObservation(observation.content);
                const relatedMemories = await findRelatedMemories(observation, category);
                
                const analysis = {
                    originalId: observation.id,
                    category: category,
                    relatedMemoryIds: relatedMemories.map(m => m.id),
                    summary: generateSummary(observation, category, relatedMemories),
                    timestamp: new Date(),
                    originalTimestamp: observation.timestamp
                };

                await memoryStore.add({
                    type: 'observation_analysis',
                    data: analysis,
                    createdAt: new Date()
                });

                analysisResults.push(analysis);
            } catch (error) {
                systemLog.log(`Failed to analyze observation ${observation.id}: ${error.message}`, 'error');
                throw error;
            }
        }

        systemState.set('observations_unanalyzed', 0);
        systemLog.log(`Successfully analyzed ${analysisResults.length} observations`, 'info');

    } catch (error) {
        systemLog.log(`Observation analysis failed: ${error.message}`, 'error');
    }
}

function classifyObservation(content) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('error') || lowerContent.includes('fail') || lowerContent.includes('exception')) {
        return 'error';
    } else if (lowerContent.includes('warning') || lowerContent.includes('warn') || lowerContent.includes('deprecated')) {
        return 'warning';
    } else if (lowerContent.includes('debug') || lowerContent.includes('trace')) {
        return 'debug';
    } else {
        return 'info';
    }
}

async function findRelatedMemories(observation, category) {
    try {
        const searchQuery = {
            $or: [
                { 'data.content': { $regex: observation.content.substring(0, 50), $options: 'i' } },
                { 'data.category': category },
                { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
            ],
            type: { $in: ['observation_analysis', 'log_entry'] }
        };
        
        return await memoryStore.search(searchQuery, 5);
    } catch (error) {
        systemLog.log(`Memory search failed: ${error.message}`, 'error');
        return [];
    }
}

function generateSummary(observation, category, relatedMemories) {
    const memorySummary = relatedMemories.length > 0 
        ? `Found ${relatedMemories.length} related memories` 
        : 'No related memories found';
    
    return `${category.toUpperCase()}: ${observation.content.substring(0, 100)}... ${memorySummary}`;
}

module.exports = analyzeObservations;