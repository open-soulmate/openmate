'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { Network, Loader2, Plus, Trash2, RefreshCw, ZoomIn, ZoomOut, Maximize2, X, Search } from 'lucide-react';
import { api, getUserId, getApiBaseUrl } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface Entity { id: string; name: string; entity_type?: string; type?: string; description?: string; properties?: Record<string, unknown>; }
interface Relation { id: string; source_entity_id?: string; source_id?: string; target_entity_id?: string; target_id?: string; relation_type?: string; type?: string; }
interface GraphNode { id: string; name: string; type: string; x: number; y: number; vx: number; vy: number; }

const COLORS: Record<string, string> = {
  person: '#f43f5e', org: '#3b82f6', location: '#10b981', event: '#f59e0b',
  concept: '#8b5cf6', document: '#6366f1', technology: '#ec4899', default: '#64748b',
};

function entityType(e: Entity): string { return e.entity_type || e.type || 'default'; }
function getRelSource(r: Relation): string { return r.source_entity_id || r.source_id || ''; }
function getRelTarget(r: Relation): string { return r.target_entity_id || r.target_id || ''; }
function getRelType(r: Relation): string { return r.relation_type || r.type || 'related'; }

export function GraphClient() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const apiBase = getApiBaseUrl();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<Relation[]>([]);

  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('concept');
  const [newDesc, setNewDesc] = useState('');
  const [showRelCreate, setShowRelCreate] = useState(false);
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('related_to');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const uid = getUserId() || 'default';
      const [eData, rData] = await Promise.all([
        fetch(`${apiBase}/api/graph/entities?user_id=${uid}&limit=200`).then(r => r.json()),
        fetch(`${apiBase}/api/graph/relations?user_id=${uid}&limit=500`).then(r => r.json()),
      ]);
      const ents = Array.isArray(eData) ? eData : eData.items || eData.results || [];
      const rels = Array.isArray(rData) ? rData : rData.items || rData.results || [];
      setEntities(ents);
      setRelations(rels);
      initForceLayout(ents, rels);
    } catch (e) { console.error('Failed to load graph', e); }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Force-directed layout
  const initForceLayout = (ents: Entity[], rels: Relation[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const nodes: GraphNode[] = ents.map((e, i) => {
      const angle = (2 * Math.PI * i) / Math.max(ents.length, 1);
      const r = Math.min(cx, cy) * 0.4;
      return {
        id: e.id, name: e.name, type: entityType(e),
        x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
      };
    });
    nodesRef.current = nodes;
    edgesRef.current = rels;
  };

  // Canvas rendering + physics simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let running = true;
    const tick = () => {
      if (!running) return;
      simulate();
      draw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [zoom, pan, hovered, selected]);

  const simulate = () => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const alpha = 0.3;

    // Repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 2000 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction along edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const edge of edges) {
      const src = nodeMap.get(getRelSource(edge));
      const tgt = nodeMap.get(getRelTarget(edge));
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 150) * 0.005;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // Center gravity
    const canvas = canvasRef.current;
    if (canvas) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.001;
        node.vy += (cy - node.y) * 0.001;
      }
    }

    // Apply velocity with damping
    for (const node of nodes) {
      if (dragRef.current?.id === node.id) continue;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx * alpha;
      node.y += node.vy * alpha;
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Draw edges
    for (const edge of edges) {
      const src = nodeMap.get(getRelSource(edge));
      const tgt = nodeMap.get(getRelTarget(edge));
      if (!src || !tgt) continue;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Edge label
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(getRelType(edge), mx, my - 6);

      // Arrow
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const arrowLen = 10;
      const ax = tgt.x - Math.cos(angle) * 25;
      const ay = tgt.y - Math.sin(angle) * 25;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const color = COLORS[node.type] || COLORS.default;
      const isHovered = hovered === node.id;
      const isSelected = selected?.id === node.id;
      const radius = isHovered || isSelected ? 22 : 18;

      // Glow
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : color + '80';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Label
      ctx.font = `${isHovered || isSelected ? 'bold ' : ''}12px sans-serif`;
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(node.name.length > 12 ? node.name.slice(0, 12) + '…' : node.name, node.x, node.y + radius + 16);

      // Type badge
      ctx.font = '9px sans-serif';
      ctx.fillStyle = color + '90';
      ctx.fillText(node.type, node.x, node.y + radius + 28);
    }

    ctx.restore();
  };

  // Mouse handlers
  const getNodeAt = (mx: number, my: number): GraphNode | null => {
    const x = (mx - pan.x) / zoom;
    const y = (my - pan.y) / zoom;
    for (const node of nodesRef.current) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy < 625) return node; // 25^2
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = getNodeAt(mx, my);
    if (node) {
      dragRef.current = { id: node.id, offsetX: (mx - pan.x) / zoom - node.x, offsetY: (my - pan.y) / zoom - node.y };
      const ent = entities.find(en => en.id === node.id);
      if (ent) setSelected(ent);
    } else {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.id);
      if (node) {
        node.x = (mx - pan.x) / zoom - dragRef.current.offsetX;
        node.y = (my - pan.y) / zoom - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
    } else if (panDragRef.current) {
      setPan({
        x: panDragRef.current.startPanX + (e.clientX - panDragRef.current.startX),
        y: panDragRef.current.startPanY + (e.clientY - panDragRef.current.startY),
      });
    } else {
      const node = getNodeAt(mx, my);
      setHovered(node?.id || null);
      canvasRef.current!.style.cursor = node ? 'grab' : 'default';
    }
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    panDragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(3, z * delta)));
  };

  const handleCreateEntity = async () => {
    if (!newName.trim()) return;
    try {
      const uid = getUserId() || 'default';
      await fetch(`${apiBase}/api/entity/?user_id=${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, entity_type: newType, description: newDesc }),
      });
      setNewName(''); setNewDesc(''); setShowCreate(false);
      loadGraph();
    } catch (e) { console.error(e); }
  };

  const handleCreateRelation = async () => {
    if (!relSource || !relTarget) return;
    try {
      await fetch(`${apiBase}/api/graph/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_entity_id: relSource, target_entity_id: relTarget, relation_type: relType }),
      });
      setRelSource(''); setRelTarget(''); setShowRelCreate(false);
      loadGraph();
    } catch (e) { console.error(e); }
  };

  const handleDeleteEntity = async (id: string) => {
    try {
      const uid = getUserId() || 'default';
      await fetch(`${apiBase}/api/entity/${id}?user_id=${uid}`, { method: 'DELETE' });
      setSelected(null);
      loadGraph();
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full bg-background"
        />

        {/* Toolbar */}
        <div className="absolute top-4 left-4 flex gap-2">
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs lg:text-sm hover:bg-primary/90 shadow-lg">
            <Plus size={14} /> {t("graph.addEntity") || "Add Entity"}
          </button>
          <button onClick={() => setShowRelCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border text-xs lg:text-sm hover:bg-muted shadow-lg">
            <Plus size={14} /> {t("graph.addRelation") || "Add Relation"}
          </button>
          <button onClick={loadGraph} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border text-xs lg:text-sm hover:bg-muted shadow-lg">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="p-2 rounded-lg bg-card border hover:bg-muted shadow-lg"><ZoomIn size={16} /></button>
          <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="p-2 rounded-lg bg-card border hover:bg-muted shadow-lg"><ZoomOut size={16} /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 rounded-lg bg-card border hover:bg-muted shadow-lg"><Maximize2 size={16} /></button>
        </div>

        {/* Stats */}
        <div className="absolute bottom-4 left-4 px-3 py-2 rounded-lg bg-card/90 border text-xs text-muted-foreground shadow-lg">
          {entities.length} {t("graph.entities") || "Entities"} · {relations.length} {t("graph.relations") || "Relations"} · {Math.round(zoom * 100)}%
        </div>

        {/* Create entity dialog */}
        {showCreate && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="bg-card border rounded-xl p-3 lg:p-6 w-96 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">{t("graph.addEntity") || "Add Entity"}</h3>
                <button onClick={() => setShowCreate(false)}><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("graph.entityName") || "Entity Name"} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm" />
                <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm">
                  {Object.keys(COLORS).filter(k => k !== 'default').map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={t("graph.descriptionOptional") || "Description (optional)"} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm" />
                <button onClick={handleCreateEntity} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs lg:text-sm hover:bg-primary/90">{t("graph.create") || "Create"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Create relation dialog */}
        {showRelCreate && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="bg-card border rounded-xl p-3 lg:p-6 w-96 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">{t("graph.addRelation") || "Add Relation"}</h3>
                <button onClick={() => setShowRelCreate(false)}><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <select value={relSource} onChange={e => setRelSource(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm">
                  <option value="">{t("graph.selectSource") || "Select source entity"}</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <select value={relTarget} onChange={e => setRelTarget(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm">
                  <option value="">{t("graph.selectTarget") || "Select target entity"}</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input value={relType} onChange={e => setRelType(e.target.value)} placeholder={t("graph.relationType") || "Relation Type"} className="w-full px-3 py-2 rounded-lg border bg-background text-xs lg:text-sm" />
                <button onClick={handleCreateRelation} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs lg:text-sm hover:bg-primary/90">{t("graph.createRelation") || "Create Relation"}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel — Sheet on mobile, inline on desktop */}
      {selected && isMobile ? (
        <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <SheetContent side="right" size="md" className="p-0 flex flex-col overflow-y-auto">
            <div className="p-4 space-y-3">
              {entityType(selected) !== 'default' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("graph.type") || "Type"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (COLORS[entityType(selected)] || COLORS.default) + '20', color: COLORS[entityType(selected)] || COLORS.default }}>{entityType(selected)}</span>
                </div>
              )}
              {selected.description && <p className="text-xs lg:text-sm text-muted-foreground">{selected.description}</p>}
              {selected.properties && Object.entries(selected.properties).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs lg:text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
              <div className="pt-3 border-t">
                <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("graph.relatedRelations") || "Related Relations"}</h3>
                {relations.filter(r => getRelSource(r) === selected.id || getRelTarget(r) === selected.id).map(r => {
                  const other = getRelSource(r) === selected.id ? entities.find(e => e.id === getRelTarget(r)) : entities.find(e => e.id === getRelSource(r));
                  return (
                    <div key={r.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="text-muted-foreground">{getRelSource(r) === selected.id ? '→' : '←'}</span>
                      <span className="px-1.5 py-0.5 rounded bg-muted">{getRelType(r)}</span>
                      <span className="text-primary cursor-pointer hover:underline" onClick={() => { const ent = entities.find(e => e.id === (getRelSource(r) === selected.id ? getRelTarget(r) : getRelSource(r))); if (ent) setSelected(ent); }}>{other?.name || (t("graph.unknown") || "Unknown")}</span>
                    </div>
                  );
                })}
                {relations.filter(r => getRelSource(r) === selected.id || getRelTarget(r) === selected.id).length === 0 && <p className="text-xs text-muted-foreground">{t("graph.noRelations") || "No relations"}</p>}
              </div>
              <button onClick={() => handleDeleteEntity(selected.id)} className="w-full mt-4 py-2 rounded-lg border border-destructive/50 text-destructive text-xs lg:text-sm hover:bg-destructive/10 flex items-center justify-center gap-1.5">
                <Trash2 size={14} /> {t("graph.deleteEntity") || "Delete Entity"}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      ) : selected ? (
        <div className="w-80 border-l bg-card overflow-y-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-xs lg:text-sm">{selected.name}</h2>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-3">
            {entityType(selected) !== 'default' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("graph.type") || "Type"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (COLORS[entityType(selected)] || COLORS.default) + '20', color: COLORS[entityType(selected)] || COLORS.default }}>{entityType(selected)}</span>
              </div>
            )}
            {selected.description && <p className="text-xs lg:text-sm text-muted-foreground">{selected.description}</p>}
            {selected.properties && Object.entries(selected.properties).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs lg:text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}

            <div className="pt-3 border-t">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">{t("graph.relatedRelations") || "Related Relations"}</h3>
              {relations.filter(r => getRelSource(r) === selected.id || getRelTarget(r) === selected.id).map(r => {
                const other = getRelSource(r) === selected.id ? entities.find(e => e.id === getRelTarget(r)) : entities.find(e => e.id === getRelSource(r));
                return (
                  <div key={r.id} className="flex items-center gap-2 py-1 text-xs">
                    <span className="text-muted-foreground">{getRelSource(r) === selected.id ? '→' : '←'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted">{getRelType(r)}</span>
                    <span className="text-primary cursor-pointer hover:underline" onClick={() => { const ent = entities.find(e => e.id === (getRelSource(r) === selected.id ? getRelTarget(r) : getRelSource(r))); if (ent) setSelected(ent); }}>{other?.name || (t("graph.unknown") || "Unknown")}</span>
                  </div>
                );
              })}
              {relations.filter(r => getRelSource(r) === selected.id || getRelTarget(r) === selected.id).length === 0 && <p className="text-xs text-muted-foreground">{t("graph.noRelations") || "No relations"}</p>}
            </div>

            <button onClick={() => handleDeleteEntity(selected.id)} className="w-full mt-4 py-2 rounded-lg border border-destructive/50 text-destructive text-xs lg:text-sm hover:bg-destructive/10 flex items-center justify-center gap-1.5">
              <Trash2 size={14} /> {t("graph.deleteEntity") || "Delete Entity"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
