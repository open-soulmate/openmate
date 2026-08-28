"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { MessageSquare, ChevronDown, ChevronRight } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────

interface Session {
  id: string;
  name?: string;
  title?: string;
  platform?: string;
  chat_id?: string;
  last_message?: string;
  unread?: number;
  workspace?: string;
  last_active?: string;
  updated_at?: string;
  created_at?: string;
  message_count?: number;
  source?: string;
}

interface SourceGroup {
  source: string;
  label: string;
  icon: string;
  sessions: Session[];
  expanded: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  logo?: string;
  description: string;
  installed: boolean;
  available?: boolean;
  category?: string;
  path?: string;
  sessions: Session[];
  expanded: boolean;
  sourceGroups?: SourceGroup[];
}

// ── Unread badge ─────────────────────────────────────────────────

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ── Props ────────────────────────────────────────────────────────

interface ConversationTreeProps {
  agents: AgentInfo[];
  activeSessionId: string | null;
  getUnread: (session: Session) => number;
  onToggleAgent: (agentId: string) => void;
  onToggleSourceGroup: (agentId: string, source: string) => void;
  onSelectSession: (session: Session, agent: AgentInfo) => void;
  /** Optional class for the root container */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────

export function ConversationTree({
  agents,
  activeSessionId,
  getUnread,
  onToggleAgent,
  onToggleSourceGroup,
  onSelectSession,
  className,
}: ConversationTreeProps) {
  const { t } = useTranslation();

  // Sort sessions: unread first, then by last_active desc
  const sortSessions = (sessions: Session[]) =>
    sessions.slice().sort((a, b) => {
      const ua = getUnread(a), ub = getUnread(b);
      if (ua > 0 && ub === 0) return -1;
      if (ua === 0 && ub > 0) return 1;
      const ta = a.last_active || a.updated_at || '';
      const tb = b.last_active || b.updated_at || '';
      return tb.localeCompare(ta);
    });

  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      {agents.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <MessageSquare size={24} className="mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {t("sidebar.noConversations", "暂无会话")}
          </p>
        </div>
      ) : (
        agents.map(agent => (
          <div key={agent.id}>
            {/* Agent header */}
            <div className="flex items-center justify-between px-2 py-2 lg:py-1.5 hover:bg-muted/50 active:bg-muted/70 group touch-manipulation">
              <button onClick={() => onToggleAgent(agent.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                {agent.expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {agent.logo
                  ? <img src={agent.logo} alt={agent.name} className="w-5 h-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : null}
                <span className={cn("text-sm", agent.logo ? "hidden" : "")}>{agent.icon}</span>
                <span className="text-sm font-medium truncate">{agent.name}</span>
              </button>
              {(() => {
                const agentUnread = agent.sessions.reduce((s, session) => s + getUnread(session), 0);
                return agentUnread > 0 ? (
                  <UnreadBadge count={agentUnread} />
                ) : (
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{agent.sessions.length}</span>
                );
              })()}
            </div>

            {/* Source groups or flat sessions */}
            {agent.expanded && agent.sourceGroups && agent.sourceGroups.length > 0 ? (
              agent.sourceGroups.map(group => (
                <div key={group.source}>
                  <button onClick={() => onToggleSourceGroup(agent.id, group.source)}
                    className="w-full flex items-center gap-1.5 pl-6 pr-3 py-2 lg:py-1.5 hover:bg-muted/40 active:bg-muted/60 touch-manipulation transition-colors">
                    {group.expanded
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="text-xs">{group.icon}</span>
                    <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                    {(() => {
                      const groupUnread = group.sessions.reduce((s, session) => s + getUnread(session), 0);
                      return groupUnread > 0 ? (
                        <span className="ml-auto"><UnreadBadge count={groupUnread} /></span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground ml-auto">{group.sessions.length}</span>
                      );
                    })()}
                  </button>
                  {group.expanded && sortSessions(group.sessions).map(session => {
                    const unread = getUnread(session);
                    const isActive = activeSessionId === session.id;
                    return (
                      <button key={session.id}
                        onClick={() => onSelectSession(session, agent)}
                        className={cn(
                          "group w-full text-left pl-8 lg:pl-12 pr-3 py-2.5 lg:py-2 hover:bg-muted/80 active:bg-muted transition-colors cursor-pointer touch-manipulation",
                          isActive && "bg-[rgba(124,58,237,0.12)] text-[#7c3aed]"
                        )}>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className={cn("w-3 h-3 shrink-0", isActive ? "text-[#7c3aed]" : "text-muted-foreground")} />
                          <span className={cn("text-xs truncate flex-1", unread > 0 ? "font-bold" : "", isActive && "text-[#7c3aed]")}>{session.name || session.title || "Untitled"}</span>
                          <UnreadBadge count={unread} />
                        </div>
                        {(session.last_active || session.updated_at) && (
                          <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">
                            {session.last_active || session.updated_at}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              agent.expanded && sortSessions(agent.sessions).map(session => {
                const unread = getUnread(session);
                const isActive = activeSessionId === session.id;
                return (
                  <button key={session.id}
                    onClick={() => onSelectSession(session, agent)}
                    className={cn(
                      "group w-full text-left pl-8 pr-3 py-2 hover:bg-muted/80 transition-colors cursor-pointer",
                      isActive && "bg-[rgba(124,58,237,0.12)] text-[#7c3aed]"
                    )}>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className={cn("w-3 h-3 shrink-0", isActive ? "text-[#7c3aed]" : "text-muted-foreground")} />
                      <span className={cn("text-xs truncate flex-1", unread > 0 ? "font-bold" : "", isActive && "text-[#7c3aed]")}>{session.name || session.title || "Untitled"}</span>
                      <UnreadBadge count={unread} />
                    </div>
                    {(session.last_active || session.updated_at) && (
                      <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">
                        {session.last_active || session.updated_at}
                      </div>
                    )}
                  </button>
                );
              })
            )}

            {agent.expanded && agent.sessions.length === 0 && (
              <div className="pl-8 pr-3 py-2 text-xs text-muted-foreground italic">
                {t("chat.noSessions")}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
