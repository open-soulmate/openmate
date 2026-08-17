"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import {
  RefreshCw, ZoomIn, ZoomOut, Maximize2, Activity,
  CheckCircle, XCircle, Loader2, Info, Network,
} from "lucide-react";
import Link from "next/link";

interface Component {
  id: string;
  name: string;
  category: string;
  layer: string;
  description: string;
  dependencies: string[];
  capabilities: string[];
  health_endpoint: string;
  api_prefix: string;
}

interface NodeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: "ok" | "error" | "loading";
  responseTime: number;
}

// Category colors matching the body-map style
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  core: { bg: "bg-violet-500/20", border: "border-violet-500", text: "text-violet-400" },
  platform: { bg: "bg-amber-500/20", border: "border-amber-500", text: "text-amber-400" },
  advanced: { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-400" },
  organ: { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-400" },
  service: { bg: "bg-amber-500/20", border: "border-amber-500", text: "text-amber-400" },
  system: { bg: "bg-emerald-500/20", border: "border-emerald-500", text: "text-emerald-400" },
  extension: { bg: "bg-rose-500/20", border: "border-rose-500", text: "text-rose-400" },
};

const EMOJI_MAP: Record<string, string> = {
  soul: "🧠", cortex: "🧩", nerve: "⚡", vein: "🩸", soma: "🤖", sense: "👁",
  will: "✨", mate: "👤", immune: "🛡", vital: "📊", marrow: "🦴", gland: "🧪",
  gene: "🧬", echo: "🔊", mirror: "🪞", link: "🔗", hippo: "🧠", reflex: "⚡",
  heredity: "🔗", nest: "🏠", pulse: "💓", limb: "💪", voice: "🎤", vision: "🎨",
  mind: "💭", capture: "📸", pipeline: "🔀", intelligence: "🔍", trajectory: "📈",
};

export function TopologyClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [components, setComponents] = useState<Component[]>([]);
  const [nodeStates, setNodeStates] = useState<Map<string, NodeState>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [showDeps, setShowDeps] = useState(true);
  const nodeStatesRef = useRef<Map<string, NodeState>>(new Map());

  // Fetch components from registry
  const fetchComponents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/registry/components`);
      const data = await res.json();
      const comps: Component[] = data.components || [];
      setComponents(comps);

      // Initialize node positions in a circular layout
      const states = new Map<string, NodeState>();
      const cx = 500, cy = 350, radius = 250;
      comps.forEach((c, i) => {
        const angle = (2 * Math.PI * i) / comps.length - Math.PI / 2;
        states.set(c.id, {
          x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
          y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
          health: "loading",
          responseTime: 0,
        });
      });
      setNodeStates(states);
      nodeStatesRef.current = states;

      // Check health of all components
      checkAllHealth(comps, states);
    } catch (e) {
      console.error("Failed to fetch components", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  // Check health for all components
  const checkAllHealth = async (comps: Component[], states: Map<string, NodeState>) => {
    const promises = comps.map(async (c) => {
      const start = performance.now();
      try {
        const res = await fetch(`${apiBase}${c.health_endpoint}`, {
          signal: AbortSignal.timeout(5000),
        });
        const elapsed = performance.now() - start;
        const s = states.get(c.id);
        if (s) {
          s.health = res.ok ? "ok" : "error";
          s.responseTime = Math.round(elapsed);
        }
      } catch {
        const s = states.get(c.id);
        if (s) {
          s.health = "error";
          s.responseTime = 0;
        }
      }
    });
    await Promise.all(promises);
    setNodeStates(new Map(states));
    nodeStatesRef.current = new Map(states);
  };

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  // Force-directed layout simulation
  useEffect(() => {
    if (components.length === 0) return;

    const simulate = () => {
      const states = nodeStatesRef.current;
      if (states.size === 0) return;

      const k = 0.01; // spring constant
      const repulsion = 5000;
      const damping = 0.85;
      const centerForce = 0.005;
      const cx = 500, cy = 350;

      // Apply forces
      const ids = Array.from(states.keys());
      for (let i = 0; i < ids.length; i++) {
        const a = states.get(ids[i])!;
        if (dragNode === ids[i]) continue;

        // Center gravity
        a.vx += (cx - a.x) * centerForce;
        a.vy += (cy - a.y) * centerForce;

        // Repulsion between all nodes
        for (let j = i + 1; j < ids.length; j++) {
          const b = states.get(ids[j])!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      // Spring forces for dependencies
      for (const comp of components) {
        const a = states.get(comp.id);
        if (!a) continue;
        for (const dep of comp.dependencies) {
          const b = states.get(dep);
          if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const idealDist = 120;
          const force = k * (dist - idealDist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      // Update positions
      let totalMovement = 0;
      for (const [id, node] of states) {
        if (dragNode === id) continue;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
        // Bounds
        node.x = Math.max(40, Math.min(960, node.x));
        node.y = Math.max(40, Math.min(660, node.y));
        totalMovement += Math.abs(node.vx) + Math.abs(node.vy);
      }

      nodeStatesRef.current = new Map(states);
      draw();

      if (totalMovement > 0.5) {
        animRef.current = requestAnimationFrame(simulate);
      }
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [components, dragNode]);

  // Draw the graph
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const states = nodeStatesRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    if (showDeps) {
      for (const comp of components) {
        if (filter !== "all" && comp.category !== filter) continue;
        const a = states.get(comp.id);
        if (!a) continue;
        for (const dep of comp.dependencies) {
          const b = states.get(dep);
          if (!b) continue;
          if (filter !== "all") {
            const depComp = components.find(c => c.id === dep);
            if (depComp && depComp.category !== filter) continue;
          }

          const isHighlighted = selected === comp.id || selected === dep ||
                                hovered === comp.id || hovered === dep;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = isHighlighted
            ? "rgba(139, 92, 246, 0.6)"
            : "rgba(100, 116, 139, 0.2)";
          ctx.lineWidth = isHighlighted ? 2 : 1;
          ctx.stroke();

          // Arrow
          if (isHighlighted) {
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            ctx.beginPath();
            ctx.moveTo(mx + 6 * Math.cos(angle), my + 6 * Math.sin(angle));
            ctx.lineTo(mx - 6 * Math.cos(angle - 0.5), my - 6 * Math.sin(angle - 0.5));
            ctx.lineTo(mx - 6 * Math.cos(angle + 0.5), my - 6 * Math.sin(angle + 0.5));
            ctx.closePath();
            ctx.fillStyle = "rgba(139, 92, 246, 0.6)";
            ctx.fill();
          }
        }
      }
    }

    // Draw nodes
    for (const comp of components) {
      if (filter !== "all" && comp.category !== filter) continue;
      const node = states.get(comp.id);
      if (!node) continue;

      const isSelected = selected === comp.id;
      const isHovered = hovered === comp.id;
      const isConnected = selected && (
        comp.dependencies.includes(selected) ||
        components.find(c => c.id === selected)?.dependencies.includes(comp.id)
      );
      const radius = isSelected ? 28 : isHovered ? 26 : 24;

      // Glow for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + 8);
        grad.addColorStop(0, "rgba(139, 92, 246, 0.3)");
        grad.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      const colors = CATEGORY_COLORS[comp.category] || CATEGORY_COLORS.system;
      ctx.fillStyle = isSelected
        ? "rgba(139, 92, 246, 0.3)"
        : isConnected
        ? "rgba(139, 92, 246, 0.15)"
        : colors.bg.replace("bg-", "").includes("violet") ? "rgba(139, 92, 246, 0.15)"
        : colors.bg.replace("bg-", "").includes("cyan") ? "rgba(6, 182, 212, 0.15)"
        : colors.bg.replace("bg-", "").includes("amber") ? "rgba(245, 158, 11, 0.15)"
        : colors.bg.replace("bg-", "").includes("emerald") ? "rgba(16, 185, 129, 0.15)"
        : "rgba(244, 63, 94, 0.15)";
      ctx.fill();

      // Border
      ctx.strokeStyle = node.health === "ok"
        ? isSelected ? "#8b5cf6" : isConnected ? "#8b5cf6" : "rgba(100, 116, 139, 0.4)"
        : node.health === "error"
        ? "#ef4444"
        : "rgba(100, 116, 139, 0.2)";
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.5;
      ctx.stroke();

      // Health indicator dot
      ctx.beginPath();
      ctx.arc(node.x + radius * 0.7, node.y - radius * 0.7, 5, 0, Math.PI * 2);
      ctx.fillStyle = node.health === "ok" ? "#22c55e"
        : node.health === "error" ? "#ef4444" : "#f59e0b";
      ctx.fill();

      // Emoji
      ctx.font = `${radius * 0.7}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(EMOJI_MAP[comp.id] || "⚙️", node.x, node.y);

      // Label
      ctx.font = `${isSelected || isHovered ? "bold " : ""}11px system-ui, sans-serif`;
      ctx.fillStyle = isSelected || isHovered ? "#e2e8f0" : "#94a3b8";
      ctx.fillText(comp.name.replace("Open", ""), node.x, node.y + radius + 14);

      // Response time on hover
      if ((isHovered || isSelected) && node.responseTime > 0) {
        ctx.font = "10px monospace";
        ctx.fillStyle = node.responseTime < 100 ? "#22c55e"
          : node.responseTime < 500 ? "#f59e0b" : "#ef4444";
        ctx.fillText(`${node.responseTime}ms`, node.x, node.y + radius + 26);
      }
    }

    ctx.restore();
  }, [components, filter, selected, hovered, showDeps, zoom, pan]);

  // Redraw when state changes
  useEffect(() => { draw(); }, [draw]);

  // Mouse handlers
  const getNodeAt = (mx: number, my: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (mx - rect.left - pan.x) / zoom;
    const y = (my - rect.top - pan.y) / zoom;
    const states = nodeStatesRef.current;

    for (const comp of components) {
      const node = states.get(comp.id);
      if (!node) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy < 28 * 28) return comp.id;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const nodeId = getNodeAt(e.clientX, e.clientY);
    if (nodeId) {
      setDragNode(nodeId);
      setIsDragging(true);
    } else {
      setIsDragging(true);
    }
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const nodeId = getNodeAt(e.clientX, e.clientY);
    setHovered(nodeId);

    if (isDragging && dragNode) {
      const node = nodeStatesRef.current.get(dragNode);
      if (node) {
        node.x += (e.clientX - lastMouse.x) / zoom;
        node.y += (e.clientY - lastMouse.y) / zoom;
        node.vx = 0; node.vy = 0;
        nodeStatesRef.current = new Map(nodeStatesRef.current);
        draw();
      }
    } else if (isDragging && !dragNode) {
      setPan(prev => ({
        x: prev.x + (e.clientX - lastMouse.x),
        y: prev.y + (e.clientY - lastMouse.y),
      }));
    }
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!isDragging || dragNode) {
      // Click on node
    }
    setIsDragging(false);
    setDragNode(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    const nodeId = getNodeAt(e.clientX, e.clientY);
    setSelected(prev => prev === nodeId ? null : nodeId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(3, prev - e.deltaY * 0.001)));
  };

  // Stats
  const healthyCount = components.filter(c => {
    const s = nodeStatesRef.current.get(c.id);
    return s?.health === "ok";
  }).length;
  const errorCount = components.filter(c => {
    const s = nodeStatesRef.current.get(c.id);
    return s?.health === "error";
  }).length;

  const selectedComp = components.find(c => c.id === selected);

  const categories = [
    { key: "all", label: t("topology.catAll") || "All", count: components.length },
    { key: "core", label: t("topology.catCore"), count: components.filter(c => c.category === "core").length },
    { key: "platform", label: t("topology.catPlatform"), count: components.filter(c => c.category === "platform").length },
    { key: "advanced", label: t("topology.catAdvanced"), count: components.filter(c => c.category === "advanced").length },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-violet-500" />
          <h1 className="text-lg font-semibold">
            {t("topology.title")}
          </h1>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-500">
            {components.length} {t("topology.components") || "components"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.min(3, z + 0.2))}
            className="rounded-lg border border-border p-1.5 hover:bg-muted">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}
            className="rounded-lg border border-border p-1.5 hover:bg-muted">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="rounded-lg border border-border p-1.5 hover:bg-muted">
            <Maximize2 size={14} />
          </button>
          <button onClick={fetchComponents}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-64 border-r border-border overflow-y-auto p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <p className="text-lg font-bold text-emerald-500">{healthyCount}</p>
              <p className="text-[10px] text-muted-foreground">{t("topology.healthy") || "Healthy"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <p className="text-lg font-bold text-red-500">{errorCount}</p>
              <p className="text-[10px] text-muted-foreground">{t("topology.error") || "Error"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <p className="text-lg font-bold">{components.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("topology.total") || "Total"}</p>
            </div>
          </div>

          {/* Category filter */}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("topology.filter") || "Filter"}</h3>
            <div className="space-y-1">
              {categories.map(cat => (
                <button key={cat.key}
                  onClick={() => setFilter(cat.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors",
                    filter === cat.key ? "bg-violet-500/10 text-violet-400" : "hover:bg-muted text-muted-foreground"
                  )}>
                  <span>{cat.label}</span>
                  <span className="text-xs opacity-60">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("topology.displayOptions") || "Display"}</h3>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={showDeps} onChange={e => setShowDeps(e.target.checked)}
                className="rounded border-border" />
              {t("topology.showDeps") || "Show dependencies"}
            </label>
          </div>

          {/* Selected component detail */}
          {selectedComp && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{EMOJI_MAP[selectedComp.id] || "⚙️"}</span>
                <div>
                  <h3 className="text-sm font-semibold">{selectedComp.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{selectedComp.layer}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{selectedComp.description}</p>
              {selectedComp.dependencies.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase">{t("topology.dependencies") || "Dependencies"}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedComp.dependencies.map(dep => (
                      <span key={dep} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {EMOJI_MAP[dep] || ""} {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedComp.capabilities.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase">{t("topology.capabilities") || "Capabilities"}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedComp.capabilities.map(cap => (
                      <span key={cap} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedComp.api_prefix && (
                <Link href={selectedComp.api_prefix.replace("/api", "") || "/"}
                  className="inline-block text-xs text-violet-400 hover:underline">
                  {t("topology.goToPage") || "Go to page"} →
                </Link>
              )}
            </div>
          )}

          {/* Legend */}
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("topology.legend") || "Legend"}</h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t("topology.healthy") || "Healthy"}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> {t("topology.error") || "Error"}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> {t("topology.checking") || "Checking"}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("topology.selected")}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-background">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 size={24} className="animate-spin text-violet-500" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={1000}
            height={700}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onWheel={handleWheel}
          />
        </div>
      </div>
    </div>
  );
}
