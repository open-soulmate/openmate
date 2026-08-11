"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Info } from "lucide-react";

interface Node {
  id: string;
  label: string;
  type: "entity" | "concept" | "document";
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
  label: string;
}

const nodes: Node[] = [
  { id: "1", label: "OpenMate", type: "entity", x: 300, y: 200 },
  { id: "2", label: "Knowledge Base", type: "concept", x: 150, y: 100 },
  { id: "3", label: "AI Chat", type: "concept", x: 450, y: 100 },
  { id: "4", label: "Skills", type: "concept", x: 150, y: 300 },
  { id: "5", label: "Soul Backend", type: "entity", x: 450, y: 300 },
  { id: "6", label: "Documents", type: "document", x: 50, y: 50 },
  { id: "7", label: "Graph Engine", type: "concept", x: 300, y: 350 },
];

const edges: Edge[] = [
  { from: "1", to: "2", label: "contains" },
  { from: "1", to: "3", label: "powers" },
  { from: "1", to: "4", label: "extends via" },
  { from: "1", to: "5", label: "connects to" },
  { from: "2", to: "6", label: "stores" },
  { from: "5", to: "7", label: "runs" },
  { from: "3", to: "5", label: "queries" },
  { from: "4", to: "5", label: "executes on" },
];

const colorMap: Record<Node["type"], string> = {
  entity: "bg-indigo-500/20 border-indigo-500/50 text-indigo-300",
  concept: "bg-emerald-500/20 border-emerald-500/50 text-emerald-300",
  document: "bg-amber-500/20 border-amber-500/50 text-amber-300",
};

function getNodePos(id: string) {
  return nodes.find((n) => n.id === id);
}

export function GraphClient() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info size={14} />
          <span>Click a node to inspect. Drag to pan.</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <ZoomIn size={14} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <ZoomOut size={14} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden bg-background">
        {/* Edges (SVG) */}
        <svg className="absolute inset-0 h-full w-full">
          {edges.map((edge, i) => {
            const from = getNodePos(edge.from);
            const to = getNodePos(edge.to);
            if (!from || !to) return null;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1}
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => setSelected(node.id === selected ? null : node.id)}
            className={`absolute flex h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border text-xs font-medium transition-all ${
              colorMap[node.type]
            } ${selected === node.id ? "ring-2 ring-primary scale-105" : "hover:scale-105"}`}
            style={{ left: node.x, top: node.y }}
          >
            {node.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-border px-6 py-2 text-[10px] text-muted-foreground">
        {Object.entries(colorMap).map(([type, cls]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className={`h-2.5 w-2.5 rounded-sm border ${cls.split(" ").slice(0, 2).join(" ")}`}
            />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
