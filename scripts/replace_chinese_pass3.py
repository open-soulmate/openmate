#!/usr/bin/env python3
"""
Pass 3: Handle remaining complex patterns:
- >中文 {var}< mixed JSX text
- >{var} 中文<
- Chinese text mixed with JSX spans
- Remaining strings in specific files
"""
import re
import os
import json
import hashlib

PROJ = '/home/climbing/openmate'
base = os.path.join(PROJ, 'src/app/(app)')

CHINESE_RE = re.compile(r'[\u4e00-\u9fff]')

with open(os.path.join(PROJ, 'src/locales/zh.json'), 'r') as f:
    zh = json.load(f)
with open(os.path.join(PROJ, 'src/locales/en.json'), 'r') as f:
    en = json.load(f)

new_zh = {}
new_en = {}

def make_key(text):
    clean = text.strip()
    h = hashlib.md5(clean.encode()).hexdigest()[:6]
    return h

def add_translation(namespace, key, zh_text):
    if namespace not in new_zh:
        new_zh[namespace] = {}
        new_en[namespace] = {}
    new_zh[namespace][key] = zh_text
    new_en[namespace][key] = zh_text

NAMESPACE_MAP = {
    'daily-digest-client.tsx': 'plugins',
    'group-chat-client.tsx': 'aiGroups',
    'groups-client.tsx': 'groups',
    'gland-client.tsx': 'gland',
    'graph-builder-client.tsx': 'graph-builder',
    'mcp-client.tsx': 'mcp',
    'team-client.tsx': 'team',
    'healer-client.tsx': 'healer',
    'link-client.tsx': 'link',
    'admin-client.tsx': 'admin',
    'timeline-client.tsx': 'timeline',
    'mirror-client.tsx': 'mirror',
    'echo-client.tsx': 'echo',
    'workflow-client.tsx': 'workflow',
    'limb-client.tsx': 'limb',
    'pomodoro-client.tsx': 'plugins',
    'notifications-client.tsx': 'notifications',
    'pipeline-client.tsx': 'pipeline',
    'workspace-client.tsx': 'workspace',
    'plugins-client.tsx': 'plugins',
}

files = [
    'plugins/daily-digest/daily-digest-client.tsx',
    'groups/[id]/group-chat-client.tsx',
    'groups/groups-client.tsx',
    'gland/gland-client.tsx',
    'graph-builder/graph-builder-client.tsx',
    'mcp/mcp-client.tsx',
    'team/team-client.tsx',
    'healer/healer-client.tsx',
    'link/link-client.tsx',
    'admin/admin-client.tsx',
    'timeline/timeline-client.tsx',
    'mirror/mirror-client.tsx',
    'echo/echo-client.tsx',
    'workflow/workflow-client.tsx',
    'limb/limb-client.tsx',
    'plugins/pomodoro/pomodoro-client.tsx',
    'notifications/notifications-client.tsx',
    'pipeline/pipeline-client.tsx',
    'workspace/workspace-client.tsx',
    'plugins/plugins-client.tsx',
]

# Manual replacements for specific complex patterns
# Format: (file, line_contains, old_text, new_key_suffix, zh_text)
MANUAL_FIXES = [
    # daily-digest
    ('daily-digest-client.tsx', '生成于', '生成于', 'generatedAt', '生成于'),
    ('daily-digest-client.tsx', '查看历史', '· 查看历史:', '· 查看历史:', '查看历史'),
    # group-chat
    ('group-chat-client.tsx', '调度模式:', '调度模式:', 'dispatchMode', '调度模式:'),
    ('group-chat-client.tsx', '主Agent:', '主Agent:', 'mainAgent', '主Agent:'),
    # groups
    ('groups-client.tsx', '成员 Agent', '成员 Agent', 'memberAgent', '成员 Agent'),
    ('groups-client.tsx', '成员数:', '成员数:', 'memberCount', '成员数:'),
    # gland
    ('gland-client.tsx', '优先级:', '优先级:', 'priority', '优先级:'),
    # graph-builder
    ('graph-builder-client.tsx', '确定要删除', '确定要删除「{deleteTarget.name}」吗？相关的关联关系也将被删除。此操作不可撤销。', 'confirmDeleteEntity', '确定要删除「{name}」吗？相关的关联关系也将被删除。此操作不可撤销。'),
    # mcp
    ('mcp-client.tsx', '可用工具', '可用工具', 'availableTools', '可用工具'),
    # team
    ('team-client.tsx', '选择成员', '选择成员', 'selectMembers', '选择成员'),
    ('team-client.tsx', '{onlineCount}在线', '{onlineCount}在线', 'onlineCount', '{count}在线'),
    ('team-client.tsx', '任务数:', '任务数:', 'taskCount', '任务数:'),
    # healer
    ('healer-client.tsx', '✅ 健康:', '✅ 健康:', 'healthy', '✅ 健康:'),
    ('healer-client.tsx', '❌ 异常:', '❌ 异常:', 'unhealthy', '❌ 异常:'),
    ('healer-client.tsx', '💊 修复:', '💊 修复:', 'healed', '💊 修复:'),
    # link
    ('link-client.tsx', '事件:', '事件:', 'events', '事件:'),
    # timeline
    ('timeline-client.tsx', '>筛选<', '筛选', 'filter', '筛选'),
    ('timeline-client.tsx', '时间:', '时间:', 'time', '时间:'),
    ('timeline-client.tsx', '收集:', '收集:', 'collected', '收集:'),
    ('timeline-client.tsx', '最近', '最近', 'recent', '最近'),
    # mirror
    ('mirror-client.tsx', '快照:', '快照:', 'snapshots', '快照:'),
    ('mirror-client.tsx', '日志:', '日志:', 'logs', '日志:'),
    ('mirror-client.tsx', '日志 (', '日志', 'logsTitle', '日志'),
    # workflow
    ('workflow-client.tsx', '最后执行:', '最后执行:', 'lastExec', '最后执行:'),
    ('workflow-client.tsx', '确定删除', '确定删除 &quot;{deleteTarget.name}&quot;？此操作不可撤销。', 'confirmDeleteWf', '确定删除「{name}」？此操作不可撤销。'),
    # limb
    ('limb-client.tsx', '使用模板:', '使用模板:', 'useTemplate', '使用模板:'),
    # pomodoro
    ('pomodoro-client.tsx', '个)', '{longInterval}个', 'intervalCount', '{count}个'),
    # pipeline
    ('pipeline-client.tsx', '历史 (', '历史', 'history', '历史'),
    ('pipeline-client.tsx', '文件ID:', '文件ID:', 'fileId', '文件ID:'),
    ('pipeline-client.tsx', '文件名:', '文件名:', 'fileName', '文件名:'),
    ('pipeline-client.tsx', '大小:', '大小:', 'size', '大小:'),
    ('pipeline-client.tsx', '步骤', '步骤', 'steps', '步骤'),
    # plugins
    ('plugins-client.tsx', '安装、配置', '安装、配置和管理系统插件', 'pluginDesc', '安装、配置和管理系统插件'),
    ('plugins-client.tsx', '共 {plugins.length}', '· 共 {plugins.length}', 'totalPlugins', '共 {count}'),
]

for filepath in files:
    basename = os.path.basename(filepath)
    namespace = NAMESPACE_MAP.get(basename, 'common')
    fullpath = os.path.join(base, filepath)
    
    with open(fullpath, 'r') as f:
        content = f.read()
    
    changed = False
    used_keys = {}
    
    def get_unique_key(text):
        base_key = make_key(text)
        if base_key in used_keys:
            if used_keys[base_key] == text:
                return base_key
            i = 2
            while f'{base_key}{i}' in used_keys:
                if used_keys[f'{base_key}{i}'] == text:
                    return f'{base_key}{i}'
                i += 1
            used_keys[f'{base_key}{i}'] = text
            return f'{base_key}{i}'
        used_keys[base_key] = text
        return base_key
    
    # Apply manual fixes
    for fix_file, marker, old_text, key_suffix, zh_text in MANUAL_FIXES:
        if fix_file != basename:
            continue
        if old_text in content:
            key = get_unique_key(zh_text)
            full_key = namespace + '.' + key
            add_translation(namespace, key, zh_text)
            
            # For patterns with mixed JSX, use different replacement strategies
            if '{' in old_text and '}' in old_text:
                # Contains expressions - wrap in template
                # This is already complex, skip auto-replacement
                pass
            elif marker == '· 查看历史:':
                content = content.replace('>· 查看历史: {selectedDate}</', '>{t("' + full_key + '") + ": " + selectedDate}</')
                changed = True
            elif marker == '生成于':
                content = content.replace(
                    '生成于 {new Date(digest.generated_at * 1000).toLocaleString(\'zh-CN\')}',
                    '{t("' + full_key + '") + " " + new Date(digest.generated_at * 1000).toLocaleString()}'
                )
                changed = True
            elif '成员 Agent' in old_text:
                # Mixed JSX - replace the Chinese text part
                content = content.replace('成员 Agent', '{t("' + full_key + '")}')
                changed = True
            elif '选择成员' in old_text:
                content = content.replace('选择成员', '{t("' + full_key + '")}')
                changed = True
            elif '成员数:' in marker:
                content = content.replace('成员数:', '{t("' + full_key + '")} ')
                changed = True
            elif '主Agent:' in marker:
                content = content.replace('主Agent:', '{t("' + full_key + '")}')
                changed = True
            elif '调度模式:' in marker:
                content = content.replace('调度模式:', '{t("' + full_key + '")}')
                changed = True
            elif marker == '优先级:':
                content = content.replace('>优先级: {p.priority}</', '>{t("' + full_key + '")} {p.priority}</')
                changed = True
            elif '可用工具' in marker:
                content = content.replace(
                    '<Wrench size={12} /> 可用工具 ({server.tools.length})',
                    '<Wrench size={12} /> {t("' + full_key + '")} ({server.tools.length})'
                )
                changed = True
            elif marker == '{onlineCount}在线':
                content = content.replace('{onlineCount}在线', '{onlineCount}{t("' + full_key + '")}')
                changed = True
            elif '任务数:' in marker:
                content = content.replace('任务数:', '{t("' + full_key + '")}')
                changed = True
            elif '✅ 健康:' in marker:
                content = content.replace('>✅ 健康: {cycleResult.healthy}<', '>{t("' + full_key + '")} {cycleResult.healthy}<')
                changed = True
            elif '❌ 异常:' in marker:
                content = content.replace('>❌ 异常: {cycleResult.unhealthy}<', '>{t("' + full_key + '")} {cycleResult.unhealthy}<')
                changed = True
            elif '💊 修复:' in marker:
                content = content.replace('>💊 修复: {cycleResult.healed}<', '>{t("' + full_key + '")} {cycleResult.healed}<')
                changed = True
            elif '事件:' in marker:
                content = content.replace('>事件: {c.event_count}</', '>{t("' + full_key + '")} {c.event_count}</')
                changed = True
            elif '筛选' in marker:
                content = content.replace('>筛选<', '>{t("' + full_key + '")}<')
                changed = True
            elif '时间:' in marker:
                content = content.replace('>时间: {formatTimestamp(ev.timestamp)}</', '>{t("' + full_key + '")} {formatTimestamp(ev.timestamp)}</')
                changed = True
            elif '收集:' in marker:
                content = content.replace('>收集: {formatTimestamp(ev.collected_at)}</', '>{t("' + full_key + '")} {formatTimestamp(ev.collected_at)}</')
                changed = True
            elif '快照:' in marker:
                content = content.replace('>快照: {sb.snapshot_count}</', '>{t("' + full_key + '")} {sb.snapshot_count}</')
                changed = True
            elif '日志:' in marker:
                content = content.replace('>日志: {sb.log_count}</', '>{t("' + full_key + '")} {sb.log_count}</')
                changed = True
            elif '日志 (' in marker:
                content = content.replace('>日志 ({logs.length})</', '>{t("' + full_key + '")} ({logs.length})</')
                changed = True
            elif '最后执行:' in marker:
                content = content.replace(
                    '最后执行: {new Date(wf.last_execution.started_at * 1000).toLocaleString()}',
                    '{t("' + full_key + '")}: {new Date(wf.last_execution.started_at * 1000).toLocaleString()}'
                )
                changed = True
            elif '使用模板:' in marker:
                content = content.replace('>使用模板: {showTemplate.name}</', '>{t("' + full_key + '")}: {showTemplate.name}</')
                changed = True
            elif '{longInterval}个' in marker:
                content = content.replace('{longInterval}个', '{longInterval}{t("' + full_key + '")}')
                changed = True
            elif '历史 (' in marker:
                content = content.replace('>历史 ({history.length})</', '>{t("' + full_key + '")} ({history.length})</')
                changed = True
            elif '文件ID:' in marker:
                content = content.replace('>文件ID: {String(step.file_id).slice(0, 16)}...</', '>{t("' + full_key + '")} {String(step.file_id).slice(0, 16)}...</')
                changed = True
            elif '文件名:' in marker:
                content = content.replace('>文件名: {String(step.name)}</', '>{t("' + full_key + '")} {String(step.name)}</')
                changed = True
            elif '大小:' in marker:
                content = content.replace(
                    '>大小: {Number(step.size).toLocaleString()} bytes</',
                    '>{t("' + full_key + '")} {Number(step.size).toLocaleString()} bytes</'
                )
                changed = True
            elif '步骤' in marker:
                content = content.replace(' 步骤', ' {t("' + full_key + '")}')
                changed = True
            elif '安装、配置' in marker:
                content = content.replace('安装、配置和管理系统插件', '{t("' + full_key + '")}')
                changed = True
            elif '共 {plugins.length}' in marker:
                content = content.replace('· 共 {plugins.length}', '· {t("' + full_key + '", { count: plugins.length })}')
                changed = True
            elif '确定删除' in marker:
                if '&quot;' in old_text:
                    content = content.replace(
                        '确定删除 &quot;{deleteTarget.name}&quot;？此操作不可撤销。',
                        '{t("' + full_key + '", { name: deleteTarget.name })}'
                    )
                else:
                    content = content.replace(
                        '确定要删除「{deleteTarget.name}」吗？相关的关联关系也将被删除。此操作不可撤销。',
                        '{t("' + full_key + '", { name: deleteTarget.name })}'
                    )
                changed = True
            elif '最近' in marker:
                # Pattern: · 最近 {o.last_event_ago}
                content = content.replace('· 最近 {o.last_event_ago}', '· {t("' + full_key + '")} {o.last_event_ago}')
                changed = True
            else:
                # Generic replacement
                content = content.replace(old_text, '{t("' + full_key + '")}')
                changed = True
    
    # Handle any remaining Chinese patterns
    # Find Chinese text in JSX that wasn't caught
    lines = content.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue
        cleaned = re.sub(r't\(["\'][^"\']+["\']\)', '', line)
        if not CHINESE_RE.search(cleaned):
            continue
        
        # Check for remaining patterns
        # Pattern: >中文 text< with expressions
        # Pattern: Chinese in comments inside JSX
        
        # Try to find Chinese text segments and wrap them
        # This is a catch-all for remaining edge cases
        def replace_chinese_segment(m):
            text = m.group(0)
            if not CHINESE_RE.search(text):
                return text
            # Skip if it looks like it's part of a comment or import
            if 'import' in text or 'require' in text:
                return text
            key = get_unique_key(text.strip())
            add_translation(namespace, key, text.strip())
            return '{t("' + namespace + '.' + key + '")}'
        
        # Replace remaining standalone Chinese segments in JSX
        # Look for Chinese surrounded by JSX delimiters
        new_line = line
        # Pattern: Chinese followed by { or < or end of string
        segments = re.findall(r'[\u4e00-\u9fff][\u4e00-\u9fff\s:：·✅❌💊]*[\u4e00-\u9fff]|[\u4e00-\u9fff]+', cleaned)
        for seg in segments:
            seg = seg.strip()
            if seg and seg in new_line:
                key = get_unique_key(seg)
                add_translation(namespace, key, seg)
                new_line = new_line.replace(seg, '{t("' + namespace + '.' + key + '")}', 1)
        
        if new_line != line:
            lines[i] = new_line
            changed = True
    
    content = '\n'.join(lines)
    
    if changed:
        with open(fullpath, 'w') as f:
            f.write(content)
        print("  " + basename + ": updated")
    else:
        print("  " + basename + ": no changes")

# Merge translations
for ns, keys in new_zh.items():
    if ns not in zh:
        zh[ns] = {}
    for k, v in keys.items():
        if k not in zh[ns]:
            zh[ns][k] = v

for ns, keys in new_en.items():
    if ns not in en:
        en[ns] = {}
    for k, v in keys.items():
        if k not in en[ns]:
            en[ns][k] = v

with open(os.path.join(PROJ, 'src/locales/zh.json'), 'w') as f:
    json.dump(zh, f, ensure_ascii=False, indent=2)
with open(os.path.join(PROJ, 'src/locales/en.json'), 'w') as f:
    json.dump(en, f, ensure_ascii=False, indent=2)

new_count = sum(len(v) for v in new_zh.values())
print("Added " + str(new_count) + " more translation keys")
