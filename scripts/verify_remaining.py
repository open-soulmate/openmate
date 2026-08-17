import re, os

base = 'src/app/(app)'
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

chinese_re = re.compile(r'[\u4e00-\u9fff]')
total_remaining = 0
for f in files:
    with open(os.path.join(base, f), 'r') as fh:
        lines = fh.readlines()
    remaining = []
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue
        cleaned = re.sub(r't\(["\'][^"\']+["\']\)', '', line)
        if chinese_re.search(cleaned):
            remaining.append((i, line.rstrip()))
    if remaining:
        print(os.path.basename(f) + ': ' + str(len(remaining)) + ' remaining')
        for ln, text in remaining[:5]:
            print('  L' + str(ln) + ': ' + text[:120])
        if len(remaining) > 5:
            print('  ... and ' + str(len(remaining) - 5) + ' more')
        total_remaining += len(remaining)

print()
print('Total remaining: ' + str(total_remaining))
