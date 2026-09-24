'use client';

/**
 * MemoryMarkerBadge — kilocode #9 记忆marker前端badge（supplement3 #9 UI侧）
 *
 * "本回复用了记忆"消息级可审计badge：数据源是 GET /api/sessions/{id}/messages
 * 每条消息的 memory_marker 字段（opensoul sessions_api._decode_memory_marker，
 * 解码自 agent_messages.metadata 的 kiloMemory——acp-proxy agent/memory_marker.py
 * 写侧产物）。kilocode marker-meta.ts 的 UI 语义：synthetic+ignored part 不进
 * LLM 上下文，但消息级可审计，UI 显示"本回复用了记忆"badge。
 *
 * 使用：<MemoryMarkerBadge marker={msg.memoryMarker} />
 * - marker缺失/为空时渲染null（零UI干扰）
 * - 紧凑徽章点击展开：类型（recall记忆召回/startup启动记忆）/条数/token估算/来源id/内容片段
 * - items是verbose门控产物（kilocode默认不落内容片段），缺失时不显示该段
 */

import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Database } from 'lucide-react';

export interface MemoryMarker {
  type: string;      // 'recall' | 'startup'
  tokens: number;    // 注入内容token估算（agent.token_attribution.estimate_tokens）
  count: number;     // 记忆条数（去重后sources数，显式count优先）
  files: string[];   // 记忆来源id列表（kilocode sources→files）
  items: string[];   // 内容片段（verbose时才有，每条≤120字符）
}

const TYPE_LABELS: Record<string, string> = {
  recall: '记忆召回',
  startup: '启动记忆',
};

export function MemoryMarkerBadge({ marker }: { marker?: MemoryMarker | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!marker) return null;
  const files = Array.isArray(marker.files) ? marker.files : [];
  const items = Array.isArray(marker.items) ? marker.items : [];
  const count = marker.count || files.length;
  if (!count && files.length === 0) return null;

  const typeLabel = TYPE_LABELS[marker.type] || marker.type || '记忆';

  return (
    <div className="mt-1.5 inline-block">
      {/* Trigger badge — 紧凑内联（kilocode："本回复用了记忆"） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400 transition-colors hover:opacity-80"
        title={`本回复用了记忆（${typeLabel}）— 点击查看详情`}
      >
        <Brain className="h-3 w-3" />
        <span>用了记忆</span>
        <span className="opacity-60">({typeLabel} {count} 条)</span>
        {expanded ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
      </button>

      {/* Expanded detail panel — 消息级可审计明细 */}
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-border bg-background/95 p-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>记忆注入审计 — 本回复上下文来自记忆库</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
              <span className="text-foreground/80">类型</span>
              <span className="font-mono text-[10px] text-muted-foreground">{typeLabel}（{marker.type}）</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
              <span className="text-foreground/80">条数 / token估算</span>
              <span className="font-mono text-[10px] text-muted-foreground">{count} 条 · ~{marker.tokens || 0} tokens</span>
            </div>
            {files.length > 0 && (
              <div className="rounded-md bg-muted/50 px-2 py-1">
                <div className="text-foreground/80 mb-0.5">记忆来源（{files.length}）</div>
                <div className="space-y-px">
                  {files.map((f, i) => (
                    <div key={`${f}-${i}`} className="truncate font-mono text-[10px] text-muted-foreground" title={f}>{f}</div>
                  ))}
                </div>
              </div>
            )}
            {items.length > 0 && (
              <div className="rounded-md bg-muted/50 px-2 py-1">
                <div className="text-foreground/80 mb-0.5">注入片段（{items.length}）</div>
                <div className="space-y-px">
                  {items.map((it, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground/80">{it}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground/70">
            来源：kilocode marker-meta（synthetic+ignored part，消息级审计标记）。内容片段仅verbose模式落盘。
          </div>
        </div>
      )}
    </div>
  );
}
