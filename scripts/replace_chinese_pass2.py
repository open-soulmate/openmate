#!/usr/bin/env python3
"""
Second pass: Handle remaining Chinese strings in complex patterns:
- Template literals: `...中文...${var}...`
- Mixed JSX: >{count} 中文<
- showToast("中文", ...)
- confirm(`中文 ${var}`)
- Time formatting functions
"""
import re
import os
import json
import hashlib

PROJ = '/home/climbing/openmate'
base = os.path.join(PROJ, 'src/app/(app)')

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

total_replacements = 0

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

for filepath in files:
    basename = os.path.basename(filepath)
    namespace = NAMESPACE_MAP.get(basename, 'common')
    fullpath = os.path.join(base, filepath)
    
    with open(fullpath, 'r') as f:
        lines = f.readlines()
    
    changed = False
    counter = [0]
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
    
    def get_existing_key(text):
        """Check if translation already exists for this text"""
        if namespace in zh:
            for k, v in zh[namespace].items():
                if v == text:
                    return k
        return None
    
    new_lines = []
    for line in lines:
        new_line = line
        
        # Skip comments
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            new_lines.append(line)
            continue
        
        # Check if line has Chinese outside t() calls
        cleaned = re.sub(r't\(["\'][^"\']+["\']\)', '', new_line)
        if not CHINESE_RE.search(cleaned):
            new_lines.append(line)
            continue
        
        # ================================================================
        # Pattern A: showToast("中文...", "type") or showToast(`中文...`)
        # ================================================================
        def replace_showToast(m):
            full = m.group(0)
            text = m.group(1)
            if not CHINESE_RE.search(text):
                return full
            # Check if text has template variables
            if '${' in text:
                # Template literal with variables - more complex
                # Extract Chinese parts and build a template
                parts = re.split(r'(\$\{[^}]+\})', text)
                # For now, use the whole thing as a key with interpolation
                key = get_unique_key(text.replace('${', '{{').replace('}', '}}'))
                add_translation(namespace, key, text.replace('${', '{{').replace('}', '}}'))
                counter[0] += 1
                return 'showToast(t("' + namespace + '.' + key + '")'
            else:
                key = get_existing_key(text) or get_unique_key(text)
                if not get_existing_key(text):
                    add_translation(namespace, key, text)
                counter[0] += 1
                return 'showToast(t("' + namespace + '.' + key + '")'
        
        new_line = re.sub(
            r"""showToast\(["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]""",
            replace_showToast,
            new_line
        )
        
        # ================================================================
        # Pattern B: confirm(`中文 ${var}`) - template confirm/alert
        # ================================================================
        def replace_confirm_template(m):
            func = m.group(1)
            text = m.group(2)
            if not CHINESE_RE.search(text):
                return m.group(0)
            # Convert template literal to interpolation
            parts = re.split(r'(\$\{[^}]+\})', text)
            t_parts = []
            for p in parts:
                if p.startswith('${') and p.endswith('}'):
                    t_parts.append(p[2:-1])  # Remove ${ and }
                elif p:
                    t_parts.append('"' + p.replace('"', '\\"') + '"')
            # For now just replace the whole string
            key = get_unique_key(text)
            add_translation(namespace, key, text)
            counter[0] += 1
            return func + '(t("' + namespace + '.' + key + '")'
        
        new_line = re.sub(
            r"""(confirm|alert)\(`([^`]*[\u4e00-\u9fff][^`]*)`\)""",
            replace_confirm_template,
            new_line
        )
        
        # ================================================================
        # Pattern C: `中文...${var}` template literals (standalone)
        # ================================================================
        # This is for patterns like: `已从数据源采集...`
        def replace_template_literal(m):
            text = m.group(1)
            if not CHINESE_RE.search(text):
                return m.group(0)
            key = get_unique_key(text)
            # Convert ${var} to {{var}} for i18n
            i18n_text = re.sub(r'\$\{([^}]+)\}', r'{{\1}}', text)
            add_translation(namespace, key, i18n_text)
            counter[0] += 1
            return 't("' + namespace + '.' + key + '")'
        
        new_line = re.sub(
            r'`([^`]*[\u4e00-\u9fff][^`]*)`',
            replace_template_literal,
            new_line
        )
        
        # ================================================================
        # Pattern D: Inline JSX with mixed text and expressions
        # >中文 {var}< >{var} 中文< >中文 {var} 中文<
        # ================================================================
        def replace_mixed_jsx(m):
            text = m.group(0)
            if not CHINESE_RE.search(text):
                return text
            # Extract Chinese parts
            chinese_parts = re.findall(r'[\u4e00-\u9fff][\u4e00-\u9fff\s]*[\u4e00-\u9fff]|[\u4e00-\u9fff]+', text)
            for cp in chinese_parts:
                cp_stripped = cp.strip()
                if not cp_stripped:
                    continue
                key = get_existing_key(cp_stripped) or get_unique_key(cp_stripped)
                if not get_existing_key(cp_stripped):
                    add_translation(namespace, key, cp_stripped)
                counter[0] += 1
                text = text.replace(cp, '{t("' + namespace + '.' + key + '")}')
            return text
        
        # This is complex - handle specific known patterns manually
        # Pattern: {var} 中文
        new_line = re.sub(r'(\})\s+([\u4e00-\u9fff]+(?:\s+[\u4e00-\u9fff]+)*)', 
                         lambda m: m.group(1) + ' {t("' + namespace + '.' + get_unique_key(m.group(2).strip()) + '")}',
                         new_line)
        
        # Pattern: 中文 {var} or just 中文
        # Only if still has Chinese after all replacements
        cleaned2 = re.sub(r't\(["\'][^"\']+["\']\)', '', new_line)
        if CHINESE_RE.search(cleaned2):
            # Find remaining Chinese in the line (not inside t() calls)
            # Simple approach: find Chinese text segments
            def replace_remaining_chinese(m):
                text = m.group(0).strip()
                if not text or not CHINESE_RE.search(text):
                    return m.group(0)
                key = get_unique_key(text)
                add_translation(namespace, key, text)
                counter[0] += 1
                return '{t("' + namespace + '.' + key + '")}'
            
            # This is tricky - let's handle line by line more carefully
            pass
        
        if new_line != line:
            changed = True
        new_lines.append(new_line)
    
    if changed:
        with open(fullpath, 'w') as f:
            f.writelines(new_lines)
        total_replacements += counter[0]
        print("  " + basename + ": " + str(counter[0]) + " additional replacements")

print("\nPass 2 total: " + str(total_replacements))

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
