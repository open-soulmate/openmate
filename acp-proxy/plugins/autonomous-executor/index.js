const vm = require('vm');
const fs = require('fs');
const path = require('path');

// 插件内部日志
const pluginLogs = [];

/**
 * 记录执行日志
 * @param {string} taskDescription - 任务描述
 * @param {string} status - 状态: 'autonomous_success'|'autonomous_fail'|'deferred_to_partner'
 * @param {string} details - 详细信息
 */
function logExecution(taskDescription, status, details) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        task_description: task_description,