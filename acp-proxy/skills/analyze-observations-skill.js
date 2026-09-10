// acp-proxy/skills/analyze-observations-skill.js

const memoryPlugin = require('../plugins/memory-plugin');

async function analyzeObservations() {
  try {
    // 1. 获取所有状态为 unanalyzed 的观察记录
    const observations = await memoryPlugin.get_observations({ status: 'unanalyzed' });
    
    if (!observations || observations.length === 0) {
      return {