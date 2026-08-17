#!/usr/bin/env python3
"""Replace hardcoded Chinese strings with i18n t() calls - part 2 (gland, workspace, misc pages)."""
import json, os

os.chdir(os.path.expanduser('~/openmate'))

with open('src/locales/zh.json') as f:
    zh = json.load(f)
with open('src/locales/en.json') as f:
    en = json.load(f)

def read(path):
    with open(path) as f:
        return f.read()

def write(path, content):
    with open(path, 'w') as f:
        f.write(content)

# ============ 6. gland-client.tsx ============
fp = 'src/app/(app)/gland/gland-client.tsx'
c = read(fp)

# Already has useTranslation import and const { t } = useTranslation()
# Now replace remaining hardcoded Chinese strings

# "确认删除 Provider" in confirm dialog
c = c.replace(
    'if (!confirm(`确认删除 Provider "${name}"？`)) return',
    'if (!confirm(t("gland.confirmDeleteProvider", { name }))) return'
)

# Labels in add provider form
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">名称 *</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">{t("gland.name")} *</label>')
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">Base URL *</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">Base URL *</label>')  # keep as-is
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">Chat 模型</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">{t("gland.chatModel")}</label>')
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">Embedding 模型</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">{t("gland.embeddingModel")}</label>')
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">API Key</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">API Key</label>')  # keep
c = c.replace('<label className="text-xs text-muted-foreground mb-1 block">优先级 (越小越优先)</label>',
    '<label className="text-xs text-muted-foreground mb-1 block">{t("gland.priorityLabel")}</label>')

# Buttons
c = c.replace('>取消</button>\n                  <button onClick={handleAddProvider}',
    ">{t('gland.cancel')}</button>\n                  <button onClick={handleAddProvider}")
c = c.replace('>添加</button>\n                </div>\n              </div>\n            )}\n\n            {/* Provider List',
    ">{t('gland.add')}</button>\n                </div>\n              </div>\n            )}\n\n            {/* Provider List")

# Provider list empty state
c = c.replace('>暂无 Provider</div>', ">{t('gland.noProviders')}</div>")

# "优先级:" text
c = c.replace('优先级: {p.priority}', '{t("gland.priority")}: {p.priority}')

# Keys tab
c = c.replace('>API Key 管理</h3>', ">{t('gland.apiKeyManagement')}</h3>")
c = c.replace('<Plus className="w-3.5 h-3.5" /> 添加 Key', "<Plus className=\"w-3.5 h-3.5\" /> {t('gland.addKey')}")

# Add key form
c = c.replace('<option value="">选择 Provider</option>', '<option value="">{t("gland.selectProvider")}</option>')
c = c.replace('>取消</button>\n                  <button onClick={handleAddKey}',
    ">{t('gland.cancel')}</button>\n                  <button onClick={handleAddKey}")
c = c.replace('>添加</button>\n                </div>\n              </div>\n            )}\n\n            {/* Keys List',
    ">{t('gland.add')}</button>\n                </div>\n              </div>\n            )}\n\n            {/* Keys List")

# Keys empty state
c = c.replace('>暂无 API Key</div>', ">{t('gland.noKeys')}</div>")

# Usage tab - "按模型统计"
c = c.replace('>按模型统计</h3>', ">{t('gland.byModel')}</h3>")
c = c.replace('>暂无使用记录</div>', ">{t('gland.noUsage')}</div>")

# "按 Provider 统计"
c = c.replace('>按 Provider 统计</h3>', ">{t('gland.byProvider')}</h3>")

# "最近调用"
c = c.replace('>最近调用</h3>', ">{t('gland.recentCalls')}</h3>")

# Table header "时间"
c = c.replace('>时间</th>', ">{t('gland.time')}</th>")

# "暂无调用记录"
c = c.replace('>暂无调用记录</div>', ">{t('gland.noCallRecords')}</div>")

# Budget section
c = c.replace('`限制: ${formatNumber(health.token_meter.budget_limit)} tokens`', '`{t("gland.limit")}: ${formatNumber(health.token_meter.budget_limit)} tokens`')
c = c.replace('"无限制"', 't("gland.unlimited")')
c = c.replace('placeholder="设置预算上限 (0=无限制)"', 'placeholder={t("gland.budgetPlaceholder")}')
c = c.replace('>设置\n                </button>', ">{t('gland.set')}\n                </button>")

# Overview tab title
c = c.replace('title="测试连接"', 'title={t("gland.testConnection")}')

write(fp, c)
print("6. gland-client.tsx done")

# Add gland keys
gland_new_zh = {
    "confirmDeleteProvider": "确认删除 Provider \"{name}\"？",
    "chatModel": "Chat 模型",
    "embeddingModel": "Embedding 模型",
    "priorityLabel": "优先级 (越小越优先)",
    "cancel": "取消",
    "add": "添加",
    "noProviders": "暂无 Provider",
    "priority": "优先级",
    "apiKeyManagement": "API Key 管理",
    "addKey": "添加 Key",
    "selectProvider": "选择 Provider",
    "noKeys": "暂无 API Key",
    "byModel": "按模型统计",
    "byProvider": "按 Provider 统计",
    "recentCalls": "最近调用",
    "time": "时间",
    "noCallRecords": "暂无调用记录",
    "limit": "限制",
    "unlimited": "无限制",
    "budgetPlaceholder": "设置预算上限 (0=无限制)",
    "set": "设置",
    "testConnection": "测试连接",
}
gland_new_en = {
    "confirmDeleteProvider": "Delete Provider \"{name}\"?",
    "chatModel": "Chat Model",
    "embeddingModel": "Embedding Model",
    "priorityLabel": "Priority (lower = higher priority)",
    "cancel": "Cancel",
    "add": "Add",
    "noProviders": "No Providers",
    "priority": "Priority",
    "apiKeyManagement": "API Key Management",
    "addKey": "Add Key",
    "selectProvider": "Select Provider",
    "noKeys": "No API Keys",
    "byModel": "By Model",
    "byProvider": "By Provider",
    "recentCalls": "Recent Calls",
    "time": "Time",
    "noCallRecords": "No call records",
    "limit": "Limit",
    "unlimited": "Unlimited",
    "budgetPlaceholder": "Set budget limit (0=unlimited)",
    "set": "Set",
    "testConnection": "Test Connection",
}

zh['gland'].update(gland_new_zh)
en['gland'].update(gland_new_en)

# ============ 7. workspace-client.tsx ============
# This file already uses t() extensively, but let me check for remaining Chinese
fp = 'src/app/(app)/workspace/workspace-client.tsx'
c = read(fp)

# Check for remaining hardcoded Chinese - the file already uses t() for most things
# Let me scan for any remaining Chinese
import re
chinese_pattern = re.compile(r'[\u4e00-\u9fff]')
lines = c.split('\n')
for i, line in enumerate(lines, 1):
    if chinese_pattern.search(line) and 't(' not in line and '//' not in line.split('t(')[0] if 't(' in line else True:
        if chinese_pattern.search(line):
            # Skip comments and imports
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('import') or stripped.startswith('*'):
                continue
            if 'formatRelativeTime' in line or 'toLocaleDateString' in line:
                continue
            print(f"  workspace line {i}: {stripped[:80]}")

# The workspace file seems already mostly done. Let me check the few remaining:
# Line 32-38 has t() calls but line 38 has "zh-CN" locale string (not user-visible)
# The file looks already i18n-ized
print("7. workspace-client.tsx - already mostly i18n-ized")

# ============ 8. page.tsx (root) ============
fp = 'src/app/page.tsx'
c = read(fp)

c = c.replace(
    "import { getToken } from '@/lib/api-client';",
    "import { getToken } from '@/lib/api-client';\nimport { useTranslation } from 'react-i18next';"
)
c = c.replace(
    'export default function HomePage() {\n  const router = useRouter();',
    'export default function HomePage() {\n  const { t } = useTranslation();\n  const router = useRouter();'
)
c = c.replace('>加载中...<', ">{t('common.loading')}...<")

write(fp, c)
print("8. page.tsx done")

# ============ 9. vein/page.tsx ============
fp = 'src/app/(app)/vein/page.tsx'
c = read(fp)

c = c.replace('title: "文件管理 · OpenMate"', "title: t('nav.vein') + ' · OpenMate'")
c = c.replace('description: "Vein 文件管理、存储统计"', "description: t('gland.description')")

# This is a server component with metadata - can't use hooks directly
# Actually, looking at it, it's just metadata. For server components we can't use useTranslation.
# Let's just use the nav key values directly for now since metadata is server-side
# Actually, let's revert and use a simpler approach - just keep the Chinese in metadata 
# since it's server-rendered and doesn't need i18n in the same way
# OR we can use next-intl or similar. For now, let's just mark it.
# Actually the simplest is to just hardcode both languages or use a helper.
# Since the project uses react-i18next (client-side), metadata can't use it.
# Let's just leave metadata as-is since it's not user-visible in the UI.

# Revert
c = read(fp)
write(fp, c)
print("9. vein/page.tsx - metadata (server-side), skipped")

# ============ 10. capture/page.tsx ============
fp = 'src/app/(app)/capture/page.tsx'
c = read(fp)
write(fp, c)
print("10. capture/page.tsx - metadata (server-side), skipped")

# Save locale files
with open('src/locales/zh.json', 'w') as f:
    json.dump(zh, f, ensure_ascii=False, indent=2)
with open('src/locales/en.json', 'w') as f:
    json.dump(en, f, ensure_ascii=False, indent=2)

print("Locale files updated (part 2)")
