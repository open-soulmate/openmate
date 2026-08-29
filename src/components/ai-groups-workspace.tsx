'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot, FileText, Image as ImageIcon, Globe, Download, Trash2,
  ChevronDown, ChevronRight, Clock, User,
} from 'lucide-react';
import { useAIGroupsStore } from '@/stores/ai-groups-store';

const ROLE_ICONS: Record<string, any> = { advisor: Bot, executor: Bot, verifier: Bot, human: User };

interface GroupFile {
  id: string;
  name: string;
  type: 'html' | 'image' | 'document' | 'code' | 'url' | 'other';
  url?: string;
  content?: string;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  createdAt: Date;
}

const FILE_ICONS: Record<string, any> = {
  html: Globe,
  image: ImageIcon,
  document: FileText,
  code: FileText,
  url: Globe,
  other: FileText,
};

export function AIGroupsWorkspace() {
  const { t } = useTranslation();
  const selectedGroup = useAIGroupsStore((s) => s.selectedGroup);
  const messages = useAIGroupsStore((s) => s.messages);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  // Extract files/outputs from messages — tasks with results become files
  const groupFiles: GroupFile[] = [];
  if (selectedGroup && messages) {
    messages.forEach((msg) => {
      if (msg.role === 'agent' && msg.content && msg.intent === 'result') {
        // Check if content looks like a file/URL
        const isUrl = /^https?:\/\//i.test(msg.content.trim());
        const isHtml = msg.content.includes('<html') || msg.content.includes('<!DOCTYPE');
        const isCode = msg.content.includes('```');

        let fileType: GroupFile['type'] = 'other';
        if (isUrl) fileType = 'url';
        else if (isHtml) fileType = 'html';
        else if (isCode) fileType = 'code';

        groupFiles.push({
          id: msg.id,
          name: `${msg.agent_name || 'Agent'} - ${new Date(msg.timestamp).toLocaleTimeString()}`,
          type: fileType,
          url: isUrl ? msg.content.trim() : undefined,
          content: !isUrl ? msg.content : undefined,
          agentId: msg.agent_id,
          agentName: msg.agent_name,
          taskId: undefined,
          createdAt: new Date(msg.timestamp),
        });
      }
    });
  }

  if (!selectedGroup) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Bot className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{t("aiGroups.selectGroup", "选择群组")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">{selectedGroup.name}</span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {groupFiles.length} {t("aiGroups.files", "个文件")}
          </span>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {groupFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">{t("aiGroups.noFiles", "暂无文件")}</p>
            <p className="text-[10px] mt-1">{t("aiGroups.filesWillAppear", "群组任务产生的文件将显示在这里")}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {groupFiles.map((file) => {
              const Icon = FILE_ICONS[file.type] || FileText;
              const isExpanded = expandedFile === file.id;
              return (
                <div key={file.id} className="border-b border-border/30">
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedFile(isExpanded ? null : file.id)}
                  >
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {file.createdAt.toLocaleTimeString()}
                        </span>
                        {file.agentName && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{file.agentName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  {isExpanded && file.content && (
                    <div className="px-3 pb-3">
                      <div className="rounded-lg bg-muted/50 p-2.5 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                        {file.type === 'html' ? (
                          <iframe
                            srcDoc={file.content}
                            className="w-full h-48 border-0 bg-white rounded"
                            title={file.name}
                          />
                        ) : (
                          file.content.slice(0, 2000)
                        )}
                      </div>
                    </div>
                  )}
                  {isExpanded && file.url && (
                    <div className="px-3 pb-3">
                      <iframe
                        src={file.url}
                        className="w-full h-48 border-0 bg-white rounded-lg"
                        title={file.name}
                        sandbox="allow-same-origin allow-scripts"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
