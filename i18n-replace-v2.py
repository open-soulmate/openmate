#!/usr/bin/env python3
"""Targeted i18n replacement for 18 files. Each file has explicit replacements."""
import json, os, re

base_dir = "/home/climbing/openmate"

# Read translation files
with open(f'{base_dir}/src/locales/zh.json', 'r') as f:
    zh = json.load(f)
with open(f'{base_dir}/src/locales/en.json', 'r') as f:
    en = json.load(f)
with open(f'{base_dir}/src/locales/ja.json', 'r') as f:
    ja = json.load(f)

def ensure_section(section):
    zh.setdefault(section, {})
    en.setdefault(section, {})
    ja.setdefault(section, {})

def add_t(section, key, zh_val, en_val, ja_val=None):
    ensure_section(section)
    zh[section][key] = zh_val
    en[section][key] = en_val
    ja[section][key] = ja_val or en_val

def apply_replacements(filepath, replacements, section, add_import=True):
    """Apply string replacements to a file. replacements is list of (old, new, key, zh_val, en_val)."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    changes = 0
    
    for old, new, key, zh_val, en_val in replacements:
        if old in content:
            content = content.replace(old, new, 1)  # Replace first occurrence only? No, replace all
            changes += 1
            add_t(section, key, zh_val, en_val)
        else:
            # Try with different whitespace
            pass
    
    # Actually replace all occurrences
    for old, new, key, zh_val, en_val in replacements:
        content = original  # Reset
        break
    
    # Re-do: replace all at once
    content = original
    for old, new, key, zh_val, en_val in replacements:
        count = content.count(old)
        if count > 0:
            content = content.replace(old, new)
            add_t(section, key, zh_val, en_val)
            changes += count
    
    if content != original:
        # Add useTranslation import if needed
        if add_import and 'useTranslation' not in original:
            # Add import after 'use client'
            if "'use client'" in content:
                content = content.replace("'use client';\n", "'use client';\nimport { useTranslation } from 'react-i18next';\n", 1)
            elif '"use client"' in content:
                content = content.replace('"use client";\n', '"use client";\nimport { useTranslation } from "react-i18next";\n', 1)
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  {filepath}: {changes} replacements applied")
    else:
        print(f"  {filepath}: no changes")
    return changes

# ──────────────────────────────────────────────────────────────
# File 1: cron/cron-client.tsx
# ──────────────────────────────────────────────────────────────
print("Processing cron/cron-client.tsx...")
f1 = f"{base_dir}/src/app/(app)/cron/cron-client.tsx"
r1 = [
    # Header
    ('> 定时任务</h1>', "> {t('cron.title')}</h1>", 'title', '定时任务', 'Cron Jobs'),
    ('>按Agent分组管理定时任务和计划</p>', ">{t('cron.subtitle')}</p>", 'subtitle', '按Agent分组管理定时任务和计划', 'Manage scheduled tasks grouped by Agent'),
    # Buttons
    ('> 新建任务</button>', "> {t('cron.newJob')}</button>", 'newJob', '新建任务', 'New Task'),
    ('> 刷新</button>', "> {t('cron.refresh')}</button>", 'refresh', '刷新', 'Refresh'),
    # Stats
    ('>总任务数</p>', ">{t('cron.totalTasks')}</p>", 'totalTasks', '总任务数', 'Total Tasks'),
    ('>运行中</p>', ">{t('cron.running')}</p>", 'running', '运行中', 'Running'),
    ('>已暂停</p>', ">{t('cron.paused')}</p>", 'paused', '已暂停', 'Paused'),
    # Create dialog
    ('> 新建定时任务</h3>', "> {t('cron.newCronJob')}</h3>", 'newCronJob', '新建定时任务', 'New Cron Job'),
    ('>任务名称</label>', ">{t('cron.taskName')}</label>", 'taskName', '任务名称', 'Task Name'),
    ('placeholder="可选"', "placeholder={t('cron.optional')}", 'optional', '可选', 'Optional'),
    ('>调度规则 <span', ">{t('cron.scheduleRule')} <span", 'scheduleRule', '调度规则', 'Schedule Rule'),
    ('>执行提示词</label>', ">{t('cron.executionPrompt')}</label>", 'executionPrompt', '执行提示词', 'Execution Prompt'),
    ('placeholder="任务指令..."', "placeholder={t('cron.taskInstructions')}", 'taskInstructions', '任务指令...', 'Task instructions...'),
    ('>投递目标</label>', ">{t('cron.deliveryTarget')}</label>", 'deliveryTarget', '投递目标', 'Delivery Target'),
    # Create/Cancel buttons
    ('>} 创建\n', ">} {t('cron.create')}\n", 'create', '创建', 'Create'),
    ('>取消</button>', ">{t('cron.cancel')}</button>", 'cancel', '取消', 'Cancel'),
    # Empty state
    ('><p>暂无定时任务</p>', "><p>{t('cron.noJobs')}</p>", 'noJobs', '暂无定时任务', 'No cron jobs'),
    # Agent group header
    ('} 个任务 · {', "} {t('cron.taskCount')} · {", 'taskCount', '个任务', 'tasks'),
    # Job times
    ('>下次: ', ">{t('cron.nextRun')} ", 'nextRun', '下次:', 'Next:'),
    ('>上次: ', ">{t('cron.lastRun')} ", 'lastRun', '上次:', 'Last:'),
    # Action buttons
    ('title="暂停"', "title={t('cron.pause')}", 'pause', '暂停', 'Pause'),
    ('title="恢复"', "title={t('cron.resume')}", 'resume', '恢复', 'Resume'),
    ('title="立即执行"', "title={t('cron.runNow')}", 'runNow', '立即执行', 'Run Now'),
    ('title="删除"', "title={t('cron.delete')}", 'delete', '删除', 'Delete'),
]
# Need to also add useTranslation
with open(f1, 'r') as f:
    c = f.read()
if 'useTranslation' not in c:
    c = c.replace("'use client';\n", "'use client';\nimport { useTranslation } from 'react-i18next';\n", 1)
    # Add const { t } = useTranslation(); at start of CronClient
    c = c.replace("export function CronClient() {\n", "export function CronClient() {\n  const { t } = useTranslation();\n", 1)
    with open(f1, 'w') as f:
        f.write(c)

apply_replacements(f1, r1, 'cron', add_import=False)

# ──────────────────────────────────────────────────────────────
# File 2: marketplace/marketplace-client.tsx
# ──────────────────────────────────────────────────────────────
print("Processing marketplace/marketplace-client.tsx...")
f2 = f"{base_dir}/src/app/(app)/marketplace/marketplace-client.tsx"
r2 = [
    # timeAgo function
    ('"从未同步"', "t('marketplace.neverSynced')", 'neverSynced', '从未同步', 'Never synced'),
    ('"刚刚"', "t('marketplace.justNow')", 'justNow', '刚刚', 'Just now'),
    ('return `${mins}分钟前`', "return t('marketplace.minAgo', { mins })", 'minAgo', '{mins}分钟前', '{mins} min ago'),
    ('return `${hours}小时前`', "return t('marketplace.hourAgo', { hours })", 'hourAgo', '{hours}小时前', '{hours} hr ago'),
    ('return `${days}天前`', "return t('marketplace.dayAgo', { days })", 'dayAgo', '{days}天前', '{days} days ago'),
    # Error messages
    ('"加载失败"', "t('marketplace.loadFailed')", 'loadFailed', '加载失败', 'Load failed'),
    ('"同步失败"', "t('marketplace.syncFailed')", 'syncFailed', '同步失败', 'Sync failed'),
    # Header
    ('>技能市场</h1>', ">{t('marketplace.title')}</h1>", 'title', '技能市场', 'Skills Marketplace'),
    ('>发现、安装和管理技能与Agent</p>', ">{t('marketplace.subtitle')}</p>", 'subtitle', '发现、安装和管理技能与Agent', 'Discover, install and manage skills and Agents'),
    ('同步全部{activeTab === "skills" ? "技能" : "Agent"}', "{t('marketplace.syncAll')}{activeTab === 'skills' ? t('marketplace.skills') : 'Agent'}", 'syncAll', '同步全部', 'Sync All'),
    ('"技能"', "t('marketplace.skills')", 'skills', '技能', 'Skills'),
    # Stats
    ('label="技能来源"', "label={t('marketplace.skillSources')}", 'skillSources', '技能来源', 'Skill Sources'),
    ('label="Agent来源"', "label={t('marketplace.agentSources')}", 'agentSources', 'Agent来源', 'Agent Sources'),
    ('label="已安装技能"', "label={t('marketplace.installedSkills')}", 'installedSkills', '已安装技能', 'Installed Skills'),
    ('label="已安装Agent"', "label={t('marketplace.installedAgents')}", 'installedAgents', '已安装Agent', 'Installed Agents'),
    # Error close
    ('>关闭</button>', ">{t('marketplace.close')}</button>", 'close', '关闭', 'Close'),
    # Tabs
    ('label="技能来源"', "label={t('marketplace.skillSources')}", 'skillSources', '技能来源', 'Skill Sources'),
    ('label="Agent来源"', "label={t('marketplace.agentSources')}", 'agentSources', 'Agent来源', 'Agent Sources'),
    # Search
    ('placeholder="搜索来源..."', "placeholder={t('marketplace.searchPlaceholder')}", 'searchPlaceholder', '搜索来源...', 'Search sources...'),
    # Empty state
    ('>暂无{type === "skills" ? "技能" : "Agent"}来源</p>', ">{t('marketplace.noItems')}</p>", 'noItems', '暂无来源', 'No sources'),
    # Item count
    ('>{count} 项</span>', ">{count} {t('marketplace.items')}</span>", 'items', '项', 'items'),
    # Sync button
    ('>同步\n', ">{t('marketplace.sync')}\n", 'sync', '同步', 'Sync'),
    # Built-in
    ('>内置来源\n', ">{t('marketplace.builtinSource')}\n", 'builtinSource', '内置来源', 'Built-in Source'),
]

with open(f2, 'r') as f:
    c = f.read()
if 'useTranslation' not in c:
    c = c.replace('"use client";\n', '"use client";\nimport { useTranslation } from "react-i18next";\n', 1)
    c = c.replace("export function MarketplaceClient() {\n", "export function MarketplaceClient() {\n  const { t } = useTranslation();\n", 1)
    with open(f2, 'w') as f:
        f.write(c)

apply_replacements(f2, r2, 'marketplace', add_import=False)

print("\nDone with first 2 files. Continuing...")
