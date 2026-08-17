#!/usr/bin/env python3
"""
i18n replacement script: Replace hardcoded Chinese strings with t() calls.
"""
import re
import os
import json
import hashlib

PROJ = '/home/climbing/openmate'
base = os.path.join(PROJ, 'src/app/(app)')
files_rel = [
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

files = [os.path.join(base, f) for f in files_rel]

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

with open(os.path.join(PROJ, 'src/locales/zh.json'), 'r') as f:
    zh = json.load(f)
with open(os.path.join(PROJ, 'src/locales/en.json'), 'r') as f:
    en = json.load(f)

new_zh = {}
new_en = {}

CHINESE_RE = re.compile(r'[\u4e00-\u9fff]')

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

total_replacements = 0
file_changes = {}

for filepath in files:
    basename = os.path.basename(filepath)
    namespace = NAMESPACE_MAP.get(basename, 'common')
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    counter = [0]  # mutable counter
    used_keys = {}
    
    def get_unique_key(ns, text):
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
    
    # STEP 1: Remove t("key") || "中文" fallback patterns
    def remove_fallback(m):
        counter[0] += 1
        key = m.group(1)
        fallback = m.group(2)
        parts = key.split('.')
        if parts[0] not in zh:
            zh[parts[0]] = {}
        if len(parts) == 2:
            if parts[1] not in zh[parts[0]]:
                zh[parts[0]][parts[1]] = fallback
        elif len(parts) >= 3:
            sub = parts[1]
            k = parts[2]
            if sub not in zh[parts[0]]:
                zh[parts[0]][sub] = {}
            if k not in zh[parts[0]][sub]:
                zh[parts[0]][sub][k] = fallback
        return 't("' + key + '")'
    
    content = re.sub(
        r"""t\(["']([^"']+)["']\)\s*\|\|\s*["']([^"']*[\u4e00-\u9fff][^"']*)["']""",
        remove_fallback,
        content
    )
    # Remove remaining non-Chinese fallbacks
    content = re.sub(
        r"""t\(["']([^"']+)["']\)\s*\|\|\s*["']([^"']+)["']""",
        lambda m: 't("' + m.group(1) + '")',
        content
    )
    
    # STEP 2: Replace Chinese in JSX attribute values
    def replace_attr(m):
        attr = m.group(1)
        quote = m.group(2)
        text = m.group(3)
        if not CHINESE_RE.search(text):
            return m.group(0)
        key = get_unique_key(namespace, text)
        add_translation(namespace, key, text)
        counter[0] += 1
        return attr + '={t("' + namespace + '.' + key + '")}'
    
    content = re.sub(
        r"""([\w-]+)=(["'])((?:(?!\2).)*[\u4e00-\u9fff](?:(?!\2).)*)\2""",
        replace_attr,
        content
    )
    
    # STEP 3: Replace Chinese in JSX text >中文<
    def replace_jsx_text(m):
        raw = m.group(1)
        text = raw.strip()
        if not text or not CHINESE_RE.search(text):
            return m.group(0)
        if '${' in text or '{' in text:
            return m.group(0)
        key = get_unique_key(namespace, text)
        add_translation(namespace, key, text)
        counter[0] += 1
        leading = raw[:len(raw) - len(raw.lstrip())]
        trailing = raw[len(raw.rstrip()):]
        return '>' + leading + '{t("' + namespace + '.' + key + '")}' + trailing + '<'
    
    content = re.sub(
        r'>([ \t]*[^<{]*?[\u4e00-\u9fff][^<{]*?)</',
        replace_jsx_text,
        content
    )
    
    # STEP 4: Replace Chinese in confirm/alert/console strings
    def replace_func_str(m):
        func = m.group(1)
        text = m.group(2)
        if not CHINESE_RE.search(text):
            return m.group(0)
        key = get_unique_key(namespace, text)
        add_translation(namespace, key, text)
        counter[0] += 1
        return func + '(t("' + namespace + '.' + key + '")'
    
    content = re.sub(
        r"""(confirm|alert|console\.\w+)\(["']([^"']*[\u4e00-\u9fff][^"']*)["']""",
        replace_func_str,
        content
    )
    
    # STEP 5: Replace standalone Chinese strings that are NOT inside t() calls
    # Pattern: "中文..." or '中文...' not preceded by t( or inside already processed
    def replace_standalone_string(m):
        full = m.group(0)
        quote = m.group(1)
        text = m.group(2)
        if not CHINESE_RE.search(text):
            return full
        # Skip if this looks like it's inside a t() call
        key = get_unique_key(namespace, text)
        add_translation(namespace, key, text)
        counter[0] += 1
        return 't("' + namespace + '.' + key + '")'
    
    # Match "中文text" or '中文text' not preceded by t(
    content = re.sub(
        r"""(?<!t\()(["'])((?:(?!\1).)*[\u4e00-\u9fff](?:(?!\1).)*)\1""",
        replace_standalone_string,
        content
    )
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        file_changes[basename] = counter[0]
        total_replacements += counter[0]
        print("  " + basename + ": " + str(counter[0]) + " replacements")
    else:
        print("  " + basename + ": NO CHANGES")

print("\nTotal replacements: " + str(total_replacements))

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
print("Added " + str(new_count) + " new translation keys")
