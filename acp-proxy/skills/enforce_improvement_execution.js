/**
 * enforce_improvement_execution.js
 * 
 * 技能：强制改进执行闭环
 * 目的：根除“执行停滞陷阱”，作为进化循环的看门人。
 * 在每个 cycle 开始时调用，确保系统即使在缺乏主动规划时也能自动推动行动。
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───────────────────────────────────────────────
const CONFIG = {
  // 主开关：设为 false 可临时禁用强制改进行为
  enabled: true,

  // 进化引擎日志目录
  evolutionLogDir: path.resolve(__dirname, '../plugins/evolution-engine/logs'),

  // 当前 cycle 日志输出路径（用于注入改进项）
  currentCyclePlanPath: path.resolve(__dirname, '../plugins/evolution-engine/current_cycle_plan.json'),

  // 事件日志路径
  eventLogPath: path.resolve(__dirname, '../plugins/evolution-engine/enforce_events.log'),

  // 待办改进池：静态任务列表
  staticImprovementPool: [
    {
      type: 'self_fix',
      description: '分析一个未处理的 observation，提取可用信息并归档',
      requirements: ['从 observations 队列中选取最早的未分析项', '输出分析报告并标记为已处理'],
      commit_message: 'self-fix: analyze one pending observation'
    },
    {
      type: 'self_programming',
      description: '尝试优化一个现有函数的性能',
      requirements: ['选取最近被频繁调用的函数', '分析其时间/空间复杂度', '提出并实施至少一项优化'],
      commit_message: 'self-programming: optimize an existing function'
    },
    {
      type: 'self_fix',
      description: '为某个模块编写一个单元测试',
      requirements: ['选取测试覆盖率最低的模块', '编写至少一个边界条件测试用例', '确保测试通过'],
      commit_message: 'self-fix: add unit test for a module'
    },
    {
      type: 'self_programming',
      description: '重构一段可读性较差的代码',
      requirements: ['识别代码异味（如过长函数、魔法数字）', '重构并保持功能不变', '验证重构后行为一致'],
      commit_message: 'self-programming: refactor for readability'
    },
    {
      type: 'self_fix',
      description: '检查并修复一个已知的错误模式',
      requirements: ['从 failure_patterns 中选取一个模式', '定位根因', '实施修复并验证'],
      commit_message: 'self-fix: address a known failure pattern'
    },
    {
      type: 'self_programming',
      description: '为系统添加一个新的小功能或工具函数',
      requirements: ['识别一个重复性手动操作', '编写自动化工具函数', '添加使用说明'],
      commit_message: 'self-programming: add utility function'
    }
  ],

  // 基于失败模式的动态任务生成规则
  dynamicFailurePatternRules: [
    {
      pattern: '自省债务累积',
      matchKeywords: ['introspection_debt', 'unprocessed_observations', '自省债务'],
      task: {
        type: 'self_fix',
        description: '清理所有未分析的 observations，消除自省债务',
        requirements: [
          '批量获取所有标记为未处理的 observations',
          '逐一分析并生成归档记录',
          '将所有处理后的 observations 标记为已分析',
          '输出债务清理报告'
        ],
        commit_message: 'self-fix: clear all unprocessed observations (introspection debt cleanup)'
      }
    },
    {
      pattern: '失败循环',
      matchKeywords: ['failure_loop', 'repeated_failures', '重复失败'],
      task: {
        type: 'self_fix',
        description: '中断失败循环：分析重复失败的根因并实施防御性修复',
        requirements: [
          '识别最近三次以上相同类型的失败',
          '执行根因分析（RCA）',
          '实施防御性编码措施（如输入校验、异常兜底）',
          '添加回归测试防止复发'
        ],
        commit_message: 'self-fix: break failure loop with defensive coding'
      }
    },
    {
      pattern: '功能退化',
      matchKeywords: ['regression', '功能退化', 'performance_degradation'],
      task: {
        type: 'self_programming',
        description: '修复功能退化：恢复最近退化的功能到基准水平',
        requirements: [
          '对比最近两次 cycle 的性能指标',
          '定位导致退化的变更',
          '回退或修复退化变更',
          '添加性能基准测试防止未来退化'
        ],
        commit_message: 'self-programming: fix regression and restore baseline'
      }
    },
    {
      pattern: '规划缺失',
      matchKeywords: ['no_planning', 'planning_skip', '规划缺失'],
      task: {
        type: 'self_programming',
        description: '增强规划模块的鲁棒性，确保不会跳过规划阶段',
        requirements: [
          '审查规划模块的触发逻辑',
          '添加规划阶段的强制检查点',
          '当规划结果为空时自动生成默认任务',
          '编写相关的防御性测试'
        ],
        commit_message: 'self-programming: harden planning module against skips'
      }
    }
  ]
};

// ─── 工具函数 ───────────────────────────────────────────

/**
 * 安全读取并解析 JSON 文件
 * @param {string} filePath - 文件路径
 * @returns {object|null} 解析后的对象，失败返回 null
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[enforce_improvement] 读取文件失败: ${filePath}`, err.message);
    return null;
  }
}

/**
 * 将 JSON 写入文件
 * @param {string} filePath - 文件路径
 * @param {object} data - 要写入的数据
 */
function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[enforce_improvement] 写入文件失败: ${filePath}`, err.message);
  }
}

/**
 * 追加事件日志
 * @param {string} message - 日志消息
 * @param {object} details - 详细信息
 */
function logEvent(message, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    skill: 'enforce_improvement_execution',
    event: message,
    ...details
  };
  try {
    const dir = path.dirname(CONFIG.eventLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.eventLogPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[enforce_improvement] 写入事件日志失败:', err.message);
  }
  console.log(`[enforce_improvement] ${message}`, JSON.stringify(details));
}

/**
 * 获取最近一次 cycle 的日志文件
 * 按文件名中的 cycle 编号或时间戳降序排列，取最新一个
 * @returns {object|null} 最近的 cycle 日志
 */
function getLatestCycleLog() {
  try {
    const logDir = CONFIG.evolutionLogDir;
    if (!fs.existsSync(logDir)) {
      logEvent('进化引擎日志目录不存在', { logDir });
      return null;
    }

    const files = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.json') && f.includes('cycle'))
      .sort()
      .reverse();

    if (files.length === 0) {
      logEvent('未找到任何 cycle 日志文件');
      return null;
    }

    const latestFile = path.join(logDir, files[0]);
    return readJsonFile(latestFile);
  } catch (err) {
    logEvent('读取最近 cycle 日志失败', { error: err.message });
    return null;
  }
}

/**
 * 从静态池中随机选取一项改进任务
 * @returns {object} 改进方案对象
 */
function pickFromStaticPool() {