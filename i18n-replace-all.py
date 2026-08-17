#!/usr/bin/env python3
"""
Replace hardcoded Chinese in 18 OpenMate UI files with i18n t() calls.
Updates zh.json, en.json, ja.json with new keys.
"""
import json, os, sys, re

BD = "/home/climbing/openmate"
SRC = f"{BD}/src/app"

# Load locale files
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

def ensure_sec(s):
    zh.setdefault(s, {})
    en.setdefault(s, {})
    ja.setdefault(s, {})

def add(s, k, z, e, j=None):
    ensure_sec(s)
    zh[s][k] = z
    en[s][k] = e
    ja[s][k] = j or e

def apply(fp, reps, section, needs_import=False, component_start=None):
    """Apply replacements to file.
    reps: list of (old_str, new_str, key, zh_val, en_val)
    """
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    orig = content
    total = 0
    
    for old, new, key, zv, ev in reps:
        cnt = content.count(old)
        if cnt > 0:
            content = content.replace(old, new)
            add(section, key, zv, ev)
            total += cnt
    
    if needs_import and 'useTranslation' not in orig:
        # Add import
        for marker in ['"use client";\n', "'use client';\n"]:
            if marker in content:
                imp = 'import { useTranslation } from "react-i18next";\n'
                content = content.replace(marker, marker + imp, 1)
                break
        # Add hook call
        if component_start and component_start in content:
            content = content.replace(component_start, component_start + '  const { t } = useTranslation();\n', 1)
    
    if content != orig:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ {os.path.basename(fp)}: {total} replacements")
    else:
        print(f"  - {os.path.basename(fp)}: no changes")

# ═══════════════════════════════════════════════════════════════
# FILE 1: cron/cron-client.tsx (24)
# ═══════════════════════════════════════════════════════════════
apply(f"{SRC}/(app)/cron/cron-client.tsx", [
    ('> 定时任务</h1>', "> {t('cron.title')}</h1>", 't', '定时任务', 'Cron Jobs'),
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
], 'cron', needs_import=True, component_start='export function CronClient() {\n')

# ═══════════════════════════════════════════════════════════════
# FILE 2: marketplace/marketplace-client.tsx (23)
# ═══════════════════════════════════════════════════════════════
apply(f"{SRC}/(app)/marketplace/marketplace-client.tsx", [
    ('return "从未同步"', "return t('marketplace.neverSynced')", 'neverSynced', '从未同步', 'Never synced'),
    ('return "刚刚"', "return t('marketplace.justNow')", 'justNow', '刚刚', 'Just now'),
    ('return `${mins}分钟前`', "return t('marketplace.minAgo', { mins })", 'minAgo', '{{mins}}分钟前', '{{mins}} min ago'),
    ('return `${hours}小时前`', "return t('marketplace.hourAgo', { hours })", 'hourAgo', '{{hours}}小时前', '{{hours}} hr ago'),
    ('return `${days}天前`', "return t('marketplace.dayAgo', { days })", 'dayAgo', '{{days}}天前', '{{days}} days ago'),
    ('"加载失败"', "t('marketplace.loadFailed')", 'loadFailed', '加载失败', 'Load failed'),
    ('"同步失败"', "t('marketplace.syncFailed')", 'syncFailed', '同步失败', 'Sync failed'),
    ('>技能市场</h1>', ">{t('marketplace.title')}</h1>", 'title', '技能市场', 'Skills Marketplace'),
    ('>发现、安装和管理技能与Agent</p>', ">{t('marketplace.subtitle')}</p>", 'subtitle', '发现、安装和管理技能与Agent', 'Discover, install and manage skills and Agents'),
    ('"技能"', "t('marketplace.skills')", 'skills', '技能', 'Skills'),
    ('label="技能来源"', "label={t('marketplace.skillSources')}", 'skillSources', '技能来源', 'Skill Sources'),
    ('label="Agent来源"', "label={t('marketplace.agentSources')}", 'agentSources', 'Agent来源', 'Agent Sources'),
    ('label="已安装技能"', "label={t('marketplace.installedSkills')}", 'installedSkills', '已安装技能', 'Installed Skills'),
    ('label="已安装Agent"', "label={t('marketplace.installedAgents')}", 'installedAgents', '已安装Agent', 'Installed Agents'),
    ('>关闭</button>', ">{t('marketplace.close')}</button>", 'close', '关闭', 'Close'),
    ('placeholder="搜索来源..."', "placeholder={t('marketplace.searchPlaceholder')}", 'searchPlaceholder', '搜索来源...', 'Search sources...'),
    ('"Agent"', "t('marketplace.agent')", 'agent', 'Agent', 'Agent'),
    ('>暂无{type === "skills" ? "技能" : "Agent"}来源</p>', ">{t('marketplace.noItems')}</p>", 'noItems', '暂无来源', 'No sources'),
    ('} 项</span>', "} {t('marketplace.items')}</span>", 'items', '项', 'items'),
    ('>同步\n', ">{t('marketplace.sync')}\n", 'sync', '同步', 'Sync'),
    ('>内置来源\n', ">{t('marketplace.builtinSource')}\n", 'builtinSource', '内置来源', 'Built-in Source'),
    ('同步全部{activeTab === "skills" ? "技能" : "Agent"}', "{t('marketplace.syncAll')}{activeTab === 'skills' ? t('marketplace.skills') : t('marketplace.agent')}", 'syncAll', '同步全部', 'Sync All'),
], 'marketplace', needs_import=True, component_start='export function MarketplaceClient() {\n')

print("\nPhase 1 complete. Saving translations...")
save_json(f'{BD}/src/locales/zh.json', zh)
save_json(f'{BD}/src/locales/en.json', en)
save_json(f'{BD}/src/locales/ja.json', ja)
print("Translations saved.")
