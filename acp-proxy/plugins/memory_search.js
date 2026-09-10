const fs = require('fs');
const path = require('path');

const MEMORY_DATA_PATH = path.join(__dirname, '../data/memories.json');

module.exports = {
  name: 'memory_search',
  description: 'Search the system memory store for relevant information using keyword matching. This tool enhances knowledge accumulation by optimizing memory retrieval efficiency, supporting other skills and agents to work more effectively.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string to match against memory content and metadata'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        default: 10
      }
    },
    required: ['query']
  },

  async execute({ query, limit = 10 }) {
    try {
      // Load memory data
      let memories = [];
      if (fs.existsSync(MEMORY_DATA_PATH)) {
        const data = fs.readFileSync(MEMORY_DATA_PATH, 'utf8');
        memories = JSON.parse(data) || [];
      }

      if (!Array.isArray(memories)) {
        memories = [];
      }

      // Normalize and tokenize the query
      const normalizedQuery = query.toLowerCase();
      const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);

      if (queryTerms.length === 0) {
        return { results: [], total_found: 0 };
      }

      // Score each memory based on keyword matches
      const scoredMemories = memories.map(memory => {
        let score = 0;
        const content = (memory.content || '').toLowerCase();
        const tags = (memory.tags || []).map(tag => tag.toLowerCase()).join(' ');
        const createdAt = (memory.created_at || '').toString().toLowerCase();
        
        // Check for matches in each field
        for (const term of queryTerms) {
          if (content.includes(term)) score += 3; // Higher weight for content matches
          if (tags.includes(term)) score += 2; // Medium weight for tag matches
          if (createdAt.includes(term)) score += 1; // Lower weight for date matches
        }
        
        return {
          ...memory,
          _score: score,
          _content_summary: memory.content ? 
            (memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content) : ''
        };
      });

      // Filter out non-matching memories and sort by score
      const matchingMemories = scoredMemories
        .filter(memory => memory._score > 0)
        .sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at));

      // Apply limit and format results
      const limitedResults = matchingMemories.slice(0, limit).map(memory => ({
        id: memory.id,
        content_summary: memory._content_summary,
        created_at: memory.created_at,
        relevance_score: memory._score
      }));

      return {
        results: limitedResults,
        total_found: matchingMemories.length
      };
    } catch (error) {
      throw new Error(`Memory search failed: ${error.message}`);
    }
  }
};