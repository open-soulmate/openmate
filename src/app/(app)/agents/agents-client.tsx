"use client";

import { useState } from "react";
import { useAppStore, type AgentNode } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  Server,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
} from "lucide-react";

const mockMetrics: Record<string, { cpu: number; mem: number; disk: number }> = {
  "soul-1": { cpu: 23, mem: 45, disk: 62 },
  "memory-1": { cpu: 12, mem: 38, disk: 41 },
  "retrieval-1": { cpu: 0, mem: 0, disk: 55 },
  "skill-1": { cpu: 8, mem: 29, disk: 33 },
};

function StatusBadge({ status }: { status: AgentNode["status"] }) {
  const map = {
    online: { variant: "success" as const, label: "Online" },
    offline: { variant: "default" as const, label: "Offline" },
    error: { variant: "destructive" as const, label: "Error" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function MetricBar({ label, icon: Icon, value }: { label: string; icon: React.ElementType; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="w-8 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value > 80 ? "bg-destructive" : value > 60 ? "bg-amber-400" : "bg-primary",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] text-muted-foreground">{value}%</span>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function AgentsClient() {
  const agentNodes = useAppStore((s) => s.agentNodes);
  const setAgentNodes = useAppStore((s) => s.setAgentNodes);
  const [deleteTarget, setDeleteTarget] = useState<AgentNode | null>(null);

  function handleDelete(id: string) {
    setAgentNodes(agentNodes.filter((n) => n.id !== id));
    setDeleteTarget(null);
  }

  const onlineCount = agentNodes.filter((n) => n.status === "online").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">Agent Nodes</h2>
            <p className="text-xs text-muted-foreground">
              {onlineCount} of {agentNodes.length} online
            </p>
          </div>
        </div>
        <button
          onClick={() => setAgentNodes([...agentNodes])}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {agentNodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Server className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">No agent nodes</h3>
            <p className="text-xs text-muted-foreground">
              Agent nodes will appear here when they connect.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agentNodes.map((node) => {
              const metrics = mockMetrics[node.id] ?? { cpu: 0, mem: 0, disk: 0 };
              return (
                <div
                  key={node.id}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {node.status === "online" ? (
                          <Wifi size={18} className="text-emerald-400" />
                        ) : (
                          <WifiOff size={18} />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">{node.name}</h3>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {node.type}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={node.status} />
                  </div>

                  <div className="mb-3 space-y-2">
                    <MetricBar label="CPU" icon={Cpu} value={metrics.cpu} />
                    <MetricBar label="MEM" icon={MemoryStick} value={metrics.mem} />
                    <MetricBar label="Disk" icon={HardDrive} value={metrics.disk} />
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock size={11} />
                      <span>{node.lastSeen}</span>
                    </div>
                    <button
                      onClick={() => setDeleteTarget(node)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      title="Remove node"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Node"
        description={`Are you sure you want to remove "${deleteTarget?.name}"? This action cannot be undone.`}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Type: {deleteTarget?.type} · Last seen: {deleteTarget?.lastSeen}
          </p>
        </div>
      </Dialog>
    </div>
  );
}
