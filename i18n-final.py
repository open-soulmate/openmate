#!/usr/bin/env python3
"""Complete i18n replacement for all 18 files."""
import json, os, re

BD = "/home/climbing/openmate"

def load_json(p):
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(p, d):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')

zh = load_json(f'{BD}/src/locales/zh.json')
en = load_json(f'{BD}/src/locales/en.json')
ja = load_json(f'{BD}/src/locales/ja.json')

def add(s, k, z, e, j=None):
    zh.setdefault(s, {})[k] = z
    en.setdefault(s, {})[k] = e
    ja.setdefault(s, {})[k] = j or e

def do_replace(fp, reps, section, needs_import=False, component_hook=None):
    """reps: [(old, new, key, zh, en), ...]
    component_hook: function name to insert 'const { t } = useTranslation();' after
    """
    with open(fp, 'r', encoding='utf-8') as f:
        c = f.read()
    orig = c
    total = 0
    for old, new, key, zv, ev in reps:
        cnt = c.count(old)
        if cnt > 0:
            c = c.replace(old, new)
            add(section, key, zv, ev)
            total += cnt
    
    if needs_import and 'useTranslation' not in orig:
        for marker in ['"use client";\n', "'use client';\n"]:
            if marker in c:
                c = c.replace(marker, marker + 'import { useTranslation } from "react-i18next";\n', 1)
                break
        if component_hook:
            hook_line = f"export function {component_hook}("
            idx = c.find(hook_line)
            if idx >= 0:
                # Find the opening brace of the function
                brace = c.find('{', idx)
                if brace >= 0:
                    # Find the newline after the brace
                    nl = c.find('\n', brace)
                    if nl >= 0:
                        c = c[:nl+1] + '  const { t } = useTranslation();\n' + c[nl+1:]
    
    if c != orig:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"  ✓ {os.path.basename(fp)}: {total} replacements")
    else:
        print(f"  - {os.path.basename(fp)}: no changes")

SRC = f"{BD}/src/app/(app)"

# ═══ FILE 1: cron/cron-client.tsx ═══
do_replace(f"{SRC}/cron/cron-client.tsx", [
    ('> 定时任务</h1>', "> {t('cron.title')}</h1>", 'title', '定时任务', 'Cron Jobs'),
    ('>按Agent分组管理定时任务和计划</p>', ">{t('cron.subtitle')}</p>", 'subtitle', '按Agent分组管理定时任务和计划', 'Manage scheduled tasks grouped by Agent'),
    ('> 新建任务</button>', "> {t('cron.newJob')}</button>", 'newJob', '新建任务', 'New Task'),
    ('> 刷新</button>', "> {t('cron.refresh')}</button>", 'refresh', '刷新', 'Refresh'),
    ('>总任务数</p>', ">{t('cron.totalTasks')}</p>", 'totalTasks', '总任务数', 'Total Tasks'),
    ('>运行中</p>', ">{t('cron.running')}</p>", 'running', '运行中', 'Running'),
    ('>已暂停</p>', ">{t('cron.paused')}</p>", 'paused', '已暂停', 'Paused'),
    ('> 新建定时任务</h3>', "> {t('cron.newCronJob')}</h3>", 'newCronJob', '新建定时任务', 'New Cron Job'),
    ('>任务名称</label>', ">{t('cron.taskName')}</label>", 'taskName', '任务名称', 'Task Name'),
    ('placeholder="可选"', "placeholder={t('cron.optional')}", 'optional', '可选', 'Optional'),
    ('>调度规则 <span', ">{t('cron.scheduleRule')} <span", 'scheduleRule', '调度规则', 'Schedule Rule'),
    ('>执行提示词</label>', ">{t('cron.executionPrompt')}</label>", 'executionPrompt', '执行提示词', 'Execution Prompt'),
    ('placeholder="任务指令..."', "placeholder={t('cron.taskInstructions')}", 'taskInstructions', '任务指令...', 'Task instructions...'),
    ('>投递目标</label>', ">{t('cron.deliveryTarget')}</label>", 'deliveryTarget', '投递目标', 'Delivery Target'),
    (' 创建\n', " {t('cron.create')}\n", 'create', '创建', 'Create'),
    ('>取消</button>', ">{t('cron.cancel')}</button>", 'cancel', '取消', 'Cancel'),
    ('><p>暂无定时任务</p>', "><p>{t('cron.noJobs')}</p>", 'noJobs', '暂无定时任务', 'No cron jobs'),
    ('} 个任务 · {', "} {t('cron.taskItems')} · {", 'taskItems', '个任务', 'tasks'),
    ('} 运行中</p>', "} {t('cron.runningItems')}</p>", 'runningItems', '运行中', 'running'),
    ('>下次: ', ">{t('cron.nextRun')} ", 'nextRun', '下次:', 'Next:'),
    ('>上次: ', ">{t('cron.lastRun')} ", 'lastRun', '上次:', 'Last:'),
    ('title="暂停"', "title={t('cron.pause')}", 'pause', '暂停', 'Pause'),
    ('title="恢复"', "title={t('cron.resume')}", 'resume', '恢复', 'Resume'),
    ('title="立即执行"', "title={t('cron.runNow')}", 'runNow', '立即执行', 'Run Now'),
], 'cron', needs_import=True, component_hook='CronClient')

# ═══ FILE 2: marketplace/marketplace-client.tsx ═══
do_replace(f"{SRC}/marketplace/marketplace-client.tsx", [
    ('return "从未同步"', "return t('marketplace.neverSynced')", 'neverSynced', '从未同步', 'Never synced'),
    ('return "刚刚"', "return t('marketplace.justNow')", 'justNow', '刚刚', 'Just now'),
    ('return `${mins}分钟前`', "return t('marketplace.minAgo', { mins })", 'minAgo', '{{mins}}分钟前', '{{mins}} min ago'),
    ('return `${hours}小时前`', "return t('marketplace.hourAgo', { hours })", 'hourAgo', '{{hours}}小时前', '{{hours}} hr ago'),
    ('return `${days}天前`', "return t('marketplace.dayAgo', { days })", 'dayAgo', '{{days}}天前', '{{days}} days ago'),
    ('"加载失败"', "t('marketplace.loadFailed')", 'loadFailed', '加载失败', 'Load failed'),
    ('"同步失败"', "t('marketplace.syncFailed')", 'syncFailed', '同步失败', 'Sync failed'),
    ('>技能市场</h1>', ">{t('marketplace.title')}</h1>", 'title', '技能市场', 'Skills Marketplace'),
    ('>发现、安装和管理技能与Agent</p>', ">{t('marketplace.subtitle')}</p>", 'subtitle', '发现、安装和管理技能与Agent', 'Discover, install and manage skills and Agents'),
    ('label="技能来源"', "label={t('marketplace.skillSources')}", 'skillSources', '技能来源', 'Skill Sources'),
    ('label="Agent来源"', "label={t('marketplace.agentSources')}", 'agentSources', 'Agent来源', 'Agent Sources'),
    ('label="已安装技能"', "label={t('marketplace.installedSkills')}", 'installedSkills', '已安装技能', 'Installed Skills'),
    ('label="已安装Agent"', "label={t('marketplace.installedAgents')}", 'installedAgents', '已安装Agent', 'Installed Agents'),
    ('>关闭</button>', ">{t('marketplace.close')}</button>", 'close', '关闭', 'Close'),
    ('placeholder="搜索来源..."', "placeholder={t('marketplace.searchPlaceholder')}", 'searchPlaceholder', '搜索来源...', 'Search sources...'),
    ('>暂无{type === "skills" ? "技能" : "Agent"}来源</p>', ">{t('marketplace.noItems')}</p>", 'noItems', '暂无来源', 'No sources'),
    ('} 项</span>', "} {t('marketplace.items')}</span>", 'items', '项', 'items'),
    ('>同步\n', ">{t('marketplace.sync')}\n", 'sync', '同步', 'Sync'),
    ('>内置来源\n', ">{t('marketplace.builtinSource')}\n", 'builtinSource', '内置来源', 'Built-in Source'),
    ('同步全部{activeTab === "skills" ? "技能" : "Agent"}', "{t('marketplace.syncAll')}{activeTab === 'skills' ? t('marketplace.skills') : t('marketplace.agent')}", 'syncAll', '同步全部', 'Sync All'),
    ('"技能"', "t('marketplace.skills')", 'skills', '技能', 'Skills'),
    ('"Agent"', "t('marketplace.agent')", 'agent', 'Agent', 'Agent'),
], 'marketplace', needs_import=True, component_hook='MarketplaceClient')

# ═══ FILE 3: cron/[id]/cron-detail-client.tsx ═══
do_replace(f"{SRC}/cron/[id]/cron-detail-client.tsx", [
    ('返回列表\n', "{t('cron.backToList')}\n", 'backToList', '返回列表', 'Back to list'),
    ('title="返回列表"', "title={t('cron.backToList')}", 'backToList', '返回列表', 'Back to list'),
    ('? \'运行中\' : \'已暂停\'', "? t('cron.running') : t('cron.paused')", 'running', '运行中', 'Running'),
    ('title="复制ID"', "title={t('cron.copyId')}", 'copyId', '复制ID', 'Copy ID'),
    ('>暂停\n', ">{t('cron.pause')}\n", 'pause', '暂停', 'Pause'),
    ('>恢复\n', ">{t('cron.resume')}\n", 'resume', '恢复', 'Resume'),
    ('>立即执行\n', ">{t('cron.runNow')}\n", 'runNow', '立即执行', 'Run Now'),
    ('>删除\n', ">{t('cron.delete')}\n", 'delete', '删除', 'Delete'),
    ('>调度规则</span>', ">{t('cron.scheduleRule')}</span>", 'scheduleRule', '调度规则', 'Schedule Rule'),
    ('>执行Agent</span>', ">{t('cron.executorAgent')}</span>", 'executorAgent', '执行Agent', 'Executor Agent'),
    ('>下次执行</span>', ">{t('cron.nextExecution')}</span>", 'nextExecution', '下次执行', 'Next Run'),
    ('>上次执行</span>', ">{t('cron.lastExecution')}</span>", 'lastExecution', '上次执行', 'Last Run'),
    ('>投递目标</span>', ">{t('cron.deliveryTarget')}</span>", 'deliveryTarget', '投递目标', 'Delivery Target'),
    ('>执行提示词</span>', ">{t('cron.executionPrompt')}</span>", 'executionPrompt', '执行提示词', 'Execution Prompt'),
    ('>最近错误</span>', ">{t('cron.recentError')}</span>", 'recentError', '最近错误', 'Recent Error'),
    ('>执行历史\n', ">{t('cron.executionHistory')}\n", 'executionHistory', '执行历史', 'Execution History'),
    ('title="刷新"', "title={t('cron.refresh')}", 'refresh', '刷新', 'Refresh'),
    ('><p>暂无执行记录</p>', "><p>{t('cron.noExecRecords')}</p>", 'noExecRecords', '暂无执行记录', 'No execution records'),
    ('>点击「立即执行」触发一次手动运行</p>', ">{t('cron.clickRunHint')}</p>", 'clickRunHint', '点击「立即执行」触发一次手动运行', "Click 'Run Now' to trigger a manual run"),
    ('? \'成功\' :\n                       entry.status === \'failed\' ? \'失败\' : \'运行中\'', "? t('cron.success') :\n                       entry.status === 'failed' ? t('cron.failed') : t('cron.running')", 'success', '成功', 'Success'),
    ('"每 "', "t('cron.every')", 'every', '每', 'Every'),
    ('`定时: ${schedule}`', "t('cron.scheduleAt', { schedule })", 'scheduleAt', '定时: {{schedule}}', 'Schedule: {{schedule}}'),
], 'cron', needs_import=True, component_hook='CronDetailClient')

# ═══ FILE 4: capture/capture-client.tsx ═══
do_replace(f"{SRC}/capture/capture-client.tsx", [
    ('> 页面\n', "> {t('capture.pageType')}\n", 'pageType', '页面', 'Page'),
    ('> 选文\n', "> {t('capture.selectionType')}\n", 'selectionType', '选文', 'Selection'),
    ('"已采集"', "t('capture.captured')", 'captured', '已采集', 'Captured'),
    ('"重复"', "t('capture.duplicate')", 'duplicate', '重复', 'Duplicate'),
    ('"已入库"', "t('capture.promoted')", 'promoted', '已入库', 'Promoted'),
    ('return "刚刚"', "return t('capture.justNow')", 'justNow', '刚刚', 'Just now'),
    ('return `${Math.floor(diff / 60)}分钟前`', "return t('capture.minAgo', { m: Math.floor(diff / 60) })", 'minAgo', '{{m}}分钟前', '{{m}} min ago'),
    ('return `${Math.floor(diff / 3600)}小时前`', "return t('capture.hourAgo', { h: Math.floor(diff / 3600) })", 'hourAgo', '{{h}}小时前', '{{h}} hr ago'),
    ('>采集管理</h1>', ">{t('capture.title')}</h1>", 'title', '采集管理', 'Capture Management'),
    ('>浏览器扩展采集的内容，可提升到知识库</p>', ">{t('capture.subtitle')}</p>", 'subtitle', '浏览器扩展采集的内容，可提升到知识库', 'Content from browser extension, can be promoted to knowledge base'),
    ('> 刷新\n', "> {t('capture.refresh')}\n", 'refresh', '刷新', 'Refresh'),
    ('>总计</div>', ">{t('capture.total')}</div>", 'total', '总计', 'Total'),
    ('>页面采集</div>', ">{t('capture.pageCaptures')}</div>", 'pageCaptures', '页面采集', 'Page Captures'),
    ('>文本采集</div>', ">{t('capture.textCaptures')}</div>", 'textCaptures', '文本采集', 'Text Captures'),
    ('"全部"', "t('capture.all')", 'all', '全部', 'All'),
    ('"页面"', "t('capture.page')", 'page', '页面', 'Page'),
    ('"选文"', "t('capture.selection')", 'selection', '选文', 'Selection'),
    ('placeholder="搜索标题、URL或内容..."', "placeholder={t('capture.searchPlaceholder')}", 'searchPlaceholder', '搜索标题、URL或内容...', 'Search title, URL or content...'),
    ('> 加载中...\n', "> {t('capture.loading')}\n", 'loading', '加载中...', 'Loading...'),
    ('><p>暂无采集内容</p>', "><p>{t('capture.noContent')}</p>", 'noContent', '暂无采集内容', 'No captured content'),
    ('>使用浏览器扩展采集网页内容</p>', ">{t('capture.useExtension')}</p>", 'useExtension', '使用浏览器扩展采集网页内容', 'Use browser extension to capture web content'),
    ('"无标题"', "t('capture.untitled')", 'untitled', '无标题', 'Untitled'),
    ('>入库\n', ">{t('capture.promote')}\n", 'promote', '入库', 'Promote'),
], 'capture', needs_import=True, component_hook='CaptureClient')

# ═══ FILE 5: plugins/smart-calc/smart-calc-client.tsx ═══
do_replace(f"{SRC}/plugins/smart-calc/smart-calc-client.tsx", [
    ('>数学表达式求解 · 单位转换 · 计算历史</p>', ">{t('smartCalc.subtitle')}</p>", 'subtitle', '数学表达式求解 · 单位转换 · 计算历史', 'Math expression solver · Unit conversion · Calculation history'),
    ('? "计算" : t === "convert" ? "单位转换" : "历史"', "? t('smartCalc.calc') : t === 'convert' ? t('smartCalc.convert') : t('smartCalc.history')", 'calc', '计算', 'Calculate'),
    ('>数学表达式</label>', ">{t('smartCalc.mathExpr')}</label>", 'mathExpr', '数学表达式', 'Math Expression'),
    ('>求解\n', ">{t('smartCalc.solve')}\n", 'solve', '求解', 'Solve'),
    ('>快捷表达式</label>', ">{t('smartCalc.quickExpr')}</label>", 'quickExpr', '快捷表达式', 'Quick Expressions'),
    ('>支持的函数和常量</h3>', ">{t('smartCalc.supportedFns')}</h3>", 'supportedFns', '支持的函数和常量', 'Supported Functions & Constants'),
    ('>精确值: ', ">{t('smartCalc.exactValue')} ", 'exactValue', '精确值:', 'Exact value:'),
    ('>类型</label>', ">{t('smartCalc.type')}</label>", 'type', '类型', 'Type'),
    ('? "长度" : cat === "weight" ? "重量" : cat === "temperature" ? "温度" :\n                     cat === "speed" ? "速度" : cat === "area" ? "面积" : cat === "volume" ? "体积"', "? t('smartCalc.length') : cat === 'weight' ? t('smartCalc.weight') : cat === 'temperature' ? t('smartCalc.temperature') :\n                     cat === 'speed' ? t('smartCalc.speed') : cat === 'area' ? t('smartCalc.area') : cat === 'volume' ? t('smartCalc.volume')", 'length', '长度', 'Length'),
    ('>数值</label>', ">{t('smartCalc.value')}</label>", 'value', '数值', 'Value'),
    ('>从</label>', ">{t('smartCalc.from')}</label>", 'from', '从', 'From'),
    ('>到</label>', ">{t('smartCalc.to')}</label>", 'to', '到', 'To'),
    ('>转换\n', ">{t('smartCalc.convertBtn')}\n", 'convertBtn', '转换', 'Convert'),
    ('} 条记录</span>', "} {t('smartCalc.records')}</span>", 'records', '条记录', 'records'),
    ('> 清空\n', "> {t('smartCalc.clear')}\n", 'clear', '清空', 'Clear'),
    ('><p>暂无计算历史</p>', "><p>{t('smartCalc.noHistory')}</p>", 'noHistory', '暂无计算历史', 'No calculation history'),
    ('? "计算" : "转换"', "? t('smartCalc.calcType') : t('smartCalc.convertType')", 'calcType', '计算', 'Calculate'),
    ('? "转换" : "计算"', "? t('smartCalc.convertType') : t('smartCalc.calcType')", 'convertType', '转换', 'Convert'),
], 'smartCalc', needs_import=True, component_hook='SmartCalcClient')

# ═══ FILE 6: graph/graph-client.tsx ═══
do_replace(f"{SRC}/graph/graph-client.tsx", [
    ('> 添加实体\n', "> {t('graph.addEntity')}\n", 'addEntity', '添加实体', 'Add Entity'),
    ('> 添加关系\n', "> {t('graph.addRelation')}\n", 'addRelation', '添加关系', 'Add Relation'),
    ('} 实体 · {', "} {t('graph.entities')} · {", 'entities', '实体', 'entities'),
    ('} 关系 · {', "} {t('graph.relations')} · {", 'relations', '关系', 'relations'),
    ('>添加实体</h3>', ">{t('graph.addEntity')}</h3>", 'addEntity', '添加实体', 'Add Entity'),
    ('placeholder="实体名称"', "placeholder={t('graph.entityName')}", 'entityName', '实体名称', 'Entity Name'),
    ('placeholder="描述（可选）"', "placeholder={t('graph.descOptional')}", 'descOptional', '描述（可选）', 'Description (optional)'),
    ('>创建</button>', ">{t('graph.create')}</button>", 'create', '创建', 'Create'),
    ('>添加关系</h3>', ">{t('graph.addRelation')}</h3>", 'addRelation', '添加关系', 'Add Relation'),
    ('>选择源实体</option>', ">{t('graph.selectSource')}</option>", 'selectSource', '选择源实体', 'Select source entity'),
    ('>选择目标实体</option>', ">{t('graph.selectTarget')}</option>", 'selectTarget', '选择目标实体', 'Select target entity'),
    ('placeholder="关系类型"', "placeholder={t('graph.relationType')}", 'relationType', '关系类型', 'Relation Type'),
    ('>创建关系</button>', ">{t('graph.createRelation')}</button>", 'createRelation', '创建关系', 'Create Relation'),
    ('>类型</span>', ">{t('graph.type')}</span>", 'type', '类型', 'Type'),
    ('>关联关系</h3>', ">{t('graph.relatedRelations')}</h3>", 'relatedRelations', '关联关系', 'Related Relations'),
    ('|| \'未知\'', "|| t('graph.unknown')", 'unknown', '未知', 'Unknown'),
    ('>暂无关系</p>', ">{t('graph.noRelations')}</p>", 'noRelations', '暂无关系', 'No relations'),
    ('> 删除实体\n', "> {t('graph.deleteEntity')}\n", 'deleteEntity', '删除实体', 'Delete Entity'),
], 'graph', needs_import=True, component_hook='GraphClient')

# ═══ FILE 7: diagnostics/diagnostics-client.tsx (already has useTranslation) ═══
do_replace(f"{SRC}/diagnostics/diagnostics-client.tsx", [
    (' || "检测中..."', " || t('diagnostics.checking')", 'checking', '检测中...', 'Checking...'),
    (' || "正常"', " || t('diagnostics.healthy')", 'healthy', '正常', 'Healthy'),
    (' || "异常"', " || t('diagnostics.unhealthy')", 'unhealthy', '异常', 'Unhealthy'),
    (' || "最大"', " || t('diagnostics.max')", 'max', '最大', 'Max'),
    (' || "核"', " || t('diagnostics.cores')", 'cores', '核', 'cores'),
    (' || "核心"', " || t('diagnostics.cores')", 'cores', '核心', 'cores'),
    (' || "状态码"', " || t('diagnostics.statusCode')", 'statusCode', '状态码', 'Status Code'),
    (' || "响应时间"', " || t('diagnostics.responseTime')", 'responseTime', '响应时间', 'Response Time'),
    (' || "分类"', " || t('diagnostics.category')", 'category', '分类', 'Category'),
    (' || "错误"', " || t('diagnostics.error')", 'error', '错误', 'Error'),
    (' || "项"', " || t('diagnostics.items')", 'items', '项', 'items'),
    (' || "默认"', " || t('diagnostics.default')", 'default', '默认', 'Default'),
    (' || "当前"', " || t('diagnostics.current')", 'current', '当前', 'Current'),
    (' || "所有系统正常运行"', " || t('diagnostics.allOk')", 'allOk', '所有系统正常运行', 'All systems operational'),
    (' || "部分系统异常"', " || t('diagnostics.partialError')", 'partialError', '部分系统异常', 'Partial system errors'),
    (' || "器官健康"', " || t('diagnostics.organHealth')", 'organHealth', '器官健康', 'organ health'),
    (' || "系统"', " || t('diagnostics.system')", 'system', '系统', 'System'),
], 'diagnostics')

# ═══ FILE 8: vision/vision-client.tsx (already has useTranslation) ═══
do_replace(f"{SRC}/vision/vision-client.tsx", [
    ('"季度销售额"', "t('vision.quarterlySales')", 'quarterlySales', '季度销售额', 'Quarterly Sales'),
    ('"趋势对比"', "t('vision.trendComparison')", 'trendComparison', '趋势对比', 'Trend Comparison'),
    ('"语言使用分布"', "t('vision.langUsage')", 'langUsage', '语言使用分布', 'Language Usage'),
    ('"散点图"', "t('vision.scatterPlot')", 'scatterPlot', '散点图', 'Scatter Plot'),
    ('label: "AI工程"', "label: t('vision.aiEngineering')", 'aiEngineering', 'AI工程', 'AI Engineering'),
    ('label: "向量检索"', "label: t('vision.vectorSearch')", 'vectorSearch', '向量检索', 'Vector Search'),
    ('label: "混合召回"', "label: t('vision.hybridRetrieval')", 'hybridRetrieval', '混合召回', 'Hybrid Retrieval'),
    ('label: "工具调用"', "label: t('vision.toolCalling')", 'toolCalling', '工具调用', 'Tool Calling'),
    ('label: "多Agent协作"', "label: t('vision.multiAgent')", 'multiAgent', '多Agent协作', 'Multi-Agent Collaboration'),
    ('"AI工程知识图谱"', "t('vision.aiKnowledgeGraph')", 'aiKnowledgeGraph', 'AI工程知识图谱', 'AI Engineering Knowledge Graph'),
    ('"JSON格式错误"', "t('vision.jsonFormatError')", 'jsonFormatError', 'JSON格式错误', 'JSON format error'),
], 'vision')

# ═══ FILE 9: learn/create/create-course-client.tsx ═══
do_replace(f"{SRC}/learn/create/create-course-client.tsx", [
    ('>生成方式</label>', ">{t('learn.generationMode')}</label>", 'generationMode', '生成方式', 'Generation Mode'),
    ('>AI 自动生成</div>', ">{t('learn.aiAutoGenerate')}</div>", 'aiAutoGenerate', 'AI 自动生成', 'AI Auto-generate'),
    ('>由LLM生成完整课程内容和测验</div>', ">{t('learn.llmGenerateDesc')}</div>", 'llmGenerateDesc', '由LLM生成完整课程内容和测验', 'Generate complete course content and quizzes by LLM'),
    ('>手动创建</div>', ">{t('learn.createManually')}</div>", 'createManually', '手动创建', 'Create Manually'),
    ('>创建课程框架，手动填充内容</div>', ">{t('learn.manualDesc')}</div>", 'manualDesc', '创建课程框架，手动填充内容', 'Create course framework, fill content manually'),
    ('>章节数量</label>', ">{t('learn.numChapters')}</label>", 'numChapters', '章节数量', 'Number of Chapters'),
    ('{n} 章', "{n} {t('learn.chapters')}", 'chapters', '章', 'Chapters'),
    ('>难度</label>', ">{t('learn.difficulty')}</label>", 'difficulty', '难度', 'Difficulty'),
    ('>入门</option>', ">{t('learn.beginner')}</option>", 'beginner', '入门', 'Beginner'),
    ('>中级</option>', ">{t('learn.intermediate')}</option>", 'intermediate', '中级', 'Intermediate'),
    ('>高级</option>', ">{t('learn.advanced')}</option>", 'advanced', '高级', 'Advanced'),
    ('alert(`AI生成失败: ${', "alert(t('learn.aiGenFailed', { detail: ", 'aiGenFailed', 'AI生成失败: {{detail}}', 'AI generation failed: {{detail}}'),
], 'learn', needs_import=True, component_hook='CreateCourseClient')

# ═══ FILE 10: agents/agents-client.tsx (already has useTranslation) ═══
do_replace(f"{SRC}/agents/agents-client.tsx", [
    ('title="模型配置"', "title={t('agents.modelConfig')}", 'modelConfig', '模型配置', 'Model Config'),
    ('使用全局默认（Gland配置）', "{t('agents.useGlobalDefault')}", 'useGlobalDefault', '使用全局默认（Gland配置）', 'Use global default (Gland config)'),
    ('自定义模型', "{t('agents.customModel')}", 'customModel', '自定义模型', 'Custom Model'),
    ('>选择Provider</option>', ">{t('agents.selectProvider')}</option>", 'selectProvider', '选择Provider', 'Select Provider'),
    ('>选择模型</option>', ">{t('agents.selectModel')}</option>", 'selectModel', '选择模型', 'Select Model'),
    ('"请选择provider和model"', "t('agents.pleaseSelect')", 'pleaseSelect', '请选择provider和model', 'Please select provider and model'),
    ('"使用Gland全局配置"', "t('agents.useGlandConfig')", 'useGlandConfig', '使用Gland全局配置', 'Use Gland global config'),
    ('>模型配置</div>', ">{t('agents.modelConfig')}</div>", 'modelConfig', '模型配置', 'Model Config'),
    ('`确定卸载 ${agent.name}？`', "t('agents.confirmUninstall', { name: agent.name })", 'confirmUninstall', '确定卸载 {{name}}？', 'Uninstall {{name}}?'),
    ('`确定批量卸载 ${selected.size} 个Agent？`', "t('agents.confirmBatchUninstall', { count: selected.size })", 'confirmBatchUninstall', '确定批量卸载 {{count}} 个Agent？', 'Batch uninstall {{count}} Agents?'),
], 'agents')

# ═══ FILE 11: workflow-builder/workflow-execution-panel.tsx ═══
do_replace(f"{SRC}/workflow-builder/workflow-execution-panel.tsx", [
    ('>当前执行\n', ">{t('workflow.execution.currentExecution')}\n", 'currentExecution', '当前执行', 'Current Execution'),
    ('>历史记录\n', ">{t('workflow.execution.history')}\n", 'history', '历史记录', 'History'),
    ('? "执行完成"', "? t('workflow.execution.completed')", 'completed', '执行完成', 'Completed'),
    ('? "执行失败"', "? t('workflow.execution.failed')", 'failed', '执行失败', 'Failed'),
    ('? "已取消"', "? t('workflow.execution.cancelled')", 'cancelled', '已取消', 'Cancelled'),
    ('>错误信息\n', ">{t('workflow.execution.errorMessage')}\n", 'errorMessage', '错误信息', 'Error Message'),
    ('>执行步骤\n', ">{t('workflow.execution.steps')}\n", 'steps', '执行步骤', 'Execution Steps'),
    ('>输入变量\n', ">{t('workflow.execution.inputVars')}\n", 'inputVars', '输入变量', 'Input Variables'),
], 'workflow')

# ═══ FILE 12: topology/topology-client.tsx ═══
do_replace(f"{SRC}/topology/topology-client.tsx", [
    ('>已选中\n', ">{t('topology.selected')}\n", 'selected', '已选中', 'Selected'),
    (' || "核心"', " || t('topology.catCore')", 'catCore', '核心', 'Core'),
    (' || "平台"', " || t('topology.catPlatform')", 'catPlatform', '平台', 'Platform'),
    (' || "高级"', " || t('topology.catAdvanced')", 'catAdvanced', '高级', 'Advanced'),
    (' || "All"', " || t('topology.catAll')", 'catAll', '全部', 'All'),
    (' || "components"', " || t('topology.components')", 'components', '组件', 'components'),
], 'topology')

# ═══ FILE 13: workflow-builder/workflow-builder-client.tsx ═══
do_replace(f"{SRC}/workflow-builder/workflow-builder-client.tsx", [
    ('"开始"', "t('workflowBuilder.start')", 'start', '开始', 'Start'),
    ('"新建工作流"', "t('workflowBuilder.newWorkflow')", 'newWorkflow', '新建工作流', 'New Workflow'),
    ('>选择或创建工作流\n', ">{t('workflowBuilder.selectOrCreate')}\n", 'selectOrCreate', '选择或创建工作流', 'Select or create a workflow'),
    ('>从左侧列表选择，或点击工具栏「新建」\n', ">{t('workflowBuilder.selectHint')}\n", 'selectHint', '从左侧列表选择，或点击工具栏「新建」', "Select from left panel, or click 'New' in toolbar"),
], 'workflowBuilder', needs_import=True, component_hook='WorkflowBuilderClient')

# ═══ FILE 14: vein/page.tsx ═══
# These are metadata strings (not in JSX), can't use t() in server components
# Skip these as they're in server-side metadata
print("  - vein/page.tsx: skipped (server-side metadata)")

# ═══ FILE 15: capture/page.tsx ═══
print("  - capture/page.tsx: skipped (server-side metadata)")

# ═══ FILE 16: page.tsx ═══
do_replace(f"{BD}/src/app/page.tsx", [
    ('>加载中...</p>', ">{t('common.loading')}</p>", 'loading', '加载中...', 'Loading...'),
], 'common', needs_import=True, component_hook='HomePage')

# ═══ FILE 17: workflow-builder/node-config-panel.tsx ═══
# Already fully i18n'd, check for remaining Chinese
with open(f"{SRC}/workflow-builder/node-config-panel.tsx", 'r') as f:
    c = f.read()
import re as re2
cn_lines = [(i+1, l) for i, l in enumerate(c.split('\n')) if re2.search(r'[\u4e00-\u9fff]', l)]
if cn_lines:
    print(f"  node-config-panel.tsx: {len(cn_lines)} lines with Chinese remaining")
    for ln, l in cn_lines[:5]:
        print(f"    L{ln}: {l.strip()[:80]}")
else:
    print("  - node-config-panel.tsx: already fully i18n'd")

# ═══ FILE 18: settings/settings-client.tsx ═══
# Check remaining Chinese
with open(f"{SRC}/settings/settings-client.tsx", 'r') as f:
    c = f.read()
cn_lines = [(i+1, l) for i, l in enumerate(c.split('\n')) if re2.search(r'[\u4e00-\u9fff]', l)]
if cn_lines:
    print(f"  settings-client.tsx: {len(cn_lines)} lines with Chinese remaining")
    for ln, l in cn_lines[:5]:
        print(f"    L{ln}: {l.strip()[:80]}")
    # The Chinese is likely in the language options which should stay
else:
    print("  - settings-client.tsx: already fully i18n'd")

# ═══ Save translations ═══
print("\nSaving translation files...")
save_json(f'{BD}/src/locales/zh.json', zh)
save_json(f'{BD}/src/locales/en.json', en)
save_json(f'{BD}/src/locales/ja.json', ja)
print("Done! Translation files updated.")

# Summary
total_zh = sum(len(v) for v in zh.values())
total_en = sum(len(v) for v in en.values())
print(f"Total zh keys: {total_zh}, en keys: {total_en}")
