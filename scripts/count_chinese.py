import re, os

base = 'src/app/(app)'
files = [
    f'{base}/plugins/daily-digest/daily-digest-client.tsx',
    f'{base}/groups/[id]/group-chat-client.tsx',
    f'{base}/groups/groups-client.tsx',
    f'{base}/gland/gland-client.tsx',
    f'{base}/graph-builder/graph-builder-client.tsx',
    f'{base}/mcp/mcp-client.tsx',
    f'{base}/team/team-client.tsx',
    f'{base}/healer/healer-client.tsx',
    f'{base}/link/link-client.tsx',
    f'{base}/admin/admin-client.tsx',
    f'{base}/timeline/timeline-client.tsx',
    f'{base}/mirror/mirror-client.tsx',
    f'{base}/echo/echo-client.tsx',
    f'{base}/workflow/workflow-client.tsx',
    f'{base}/limb/limb-client.tsx',
    f'{base}/plugins/pomodoro/pomodoro-client.tsx',
    f'{base}/notifications/notifications-client.tsx',
    f'{base}/pipeline/pipeline-client.tsx',
    f'{base}/workspace/workspace-client.tsx',
    f'{base}/plugins/plugins-client.tsx',
]

for f in files:
    with open(f, 'r') as fh:
        content = fh.read()
    matches = re.findall(r"['\"`]([^'\"`]*[\u4e00-\u9fff][^'\"`]*)['\"`]", content)
    print(f'{os.path.basename(f)}: {len(matches)} Chinese strings')
