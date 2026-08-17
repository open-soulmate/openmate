'use client';
import { useState, useEffect, useCallback } from 'react';
import { Network, Plus, Trash2, Loader2, Link2, X } from 'lucide-react';
import { api, getUserId } from '@/lib/api-client';

interface Entity { id: string; name: string; type: string; description?: string; properties?: Record<string, unknown>; }
interface Relation { id: string; source_id: string; target_id: string; type: string; }

const ENTITY_TYPES = [
  { value: 'concept', label: '概念' },
  { value: 'person', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'event', label: '事件' },
  { value: 'technology', label: '技术' },
  { value: 'organization', label: '组织' },
];

const RELATION_TYPES = [
  '属于', '包含', '关联', '依赖', '位于', '创建', '使用', '属于组织', '参与', '相关',
];

export function GraphBuilderClient() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entity | null>(null);

  // Create entity form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('concept');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Create relation form
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('关联');
  const [creatingRel, setCreatingRel] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const uid = getUserId() || 'default';
      const [eData, rData] = await Promise.all([api.getEntities(uid), api.getRelations()]);
      setEntities(Array.isArray(eData) ? eData : eData.items || eData.results || []);
      setRelations(Array.isArray(rData) ? rData : rData.items || rData.results || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const handleCreateEntity = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const uid = getUserId() || 'default';
      await api.createEntity(uid, {
        name: newName.trim(),
        type: newType,
        description: newDesc.trim() || undefined,
      });
      setNewName(''); setNewDesc(''); setNewType('concept');
      setShowAdd(false);
      await loadGraph();
    } catch (e) { console.error('Failed to create entity:', e); }
    setCreating(false);
  };

  const handleDeleteEntity = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const uid = getUserId() || 'default';
      await api.deleteEntity(deleteTarget.id, uid);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await loadGraph();
    } catch (e) { console.error('Failed to delete entity:', e); }
    setDeleting(false);
  };

  const handleCreateRelation = async () => {
    if (!relSource || !relTarget || relSource === relTarget) return;
    setCreatingRel(true);
    try {
      await api.createRelation({
        source_id: relSource,
        target_id: relTarget,
        type: relType,
      });
      setRelSource(''); setRelTarget(''); setRelType('关联');
      setShowAddRelation(false);
      await loadGraph();
    } catch (e) { console.error('Failed to create relation:', e); }
    setCreatingRel(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const getEntityRelations = (entityId: string) =>
    relations.filter(r => r.source_id === entityId || r.target_id === entityId);

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="w-6 h-6" /> 知识图谱构建</h1>
          <div className="flex gap-2">
            <button onClick={() => { setShowAddRelation(!showAddRelation); setShowAdd(false); }}
              className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted transition-colors">
              <Link2 className="w-4 h-4" /> 添加关系
            </button>
            <button onClick={() => { setShowAdd(!showAdd); setShowAddRelation(false); }}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1 hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> 添加实体
            </button>
          </div>
        </div>

        {/* Create Entity Form */}
        {showAdd && (
          <div className="mb-4 p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">新建实体</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="实体名称"
              className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm outline-none focus:border-primary" />
            <select value={newType} onChange={e => setNewType(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm outline-none">
              {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）"
              className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm outline-none focus:border-primary" />
            <div className="flex gap-2">
              <button onClick={handleCreateEntity} disabled={!newName.trim() || creating}
                className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50 flex items-center gap-1">
                {creating && <Loader2 className="w-3 h-3 animate-spin" />} 创建
              </button>
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded border text-sm">取消</button>
            </div>
          </div>
        )}

        {/* Create Relation Form */}
        {showAddRelation && (
          <div className="mb-4 p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">新建关系</h3>
              <button onClick={() => setShowAddRelation(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <select value={relSource} onChange={e => setRelSource(e.target.value)}
                className="px-3 py-2 rounded border bg-background text-sm outline-none">
                <option value="">源实体</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select value={relType} onChange={e => setRelType(e.target.value)}
                className="px-3 py-2 rounded border bg-background text-sm outline-none">
                {RELATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={relTarget} onChange={e => setRelTarget(e.target.value)}
                className="px-3 py-2 rounded border bg-background text-sm outline-none">
                <option value="">目标实体</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateRelation} disabled={!relSource || !relTarget || relSource === relTarget || creatingRel}
                className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50 flex items-center gap-1">
                {creatingRel && <Loader2 className="w-3 h-3 animate-spin" />} 创建关系
              </button>
              <button onClick={() => setShowAddRelation(false)} className="px-3 py-1.5 rounded border text-sm">取消</button>
            </div>
          </div>
        )}

        {/* Stats */}
        <p className="text-sm text-muted-foreground mb-4">{entities.length} 个实体，{relations.length} 个关系</p>

        {/* Entity Grid */}
        {entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Network className="w-12 h-12 mb-4 opacity-50" />
            <p>暂无图谱数据</p>
            <p className="text-sm mt-1">点击「添加实体」开始构建知识图谱</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {entities.map(e => {
              const relCount = getEntityRelations(e.id).length;
              return (
                <div key={e.id} onClick={() => setSelected(e)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected?.id === e.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/50'
                  }`}>
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-sm">{e.name}</p>
                    {relCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{relCount} 关系</span>
                    )}
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted mt-1 inline-block">{e.type}</span>
                  {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Sidebar */}
      {selected && (
        <div className="w-80 border-l p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">{selected.name}</h2>
            <button onClick={() => setDeleteTarget(selected)}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="删除实体">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm mb-2"><span className="text-muted-foreground">类型：</span>{selected.type}</p>
          {selected.description && <p className="text-sm mb-2"><span className="text-muted-foreground">描述：</span>{selected.description}</p>}
          {selected.properties && Object.entries(selected.properties).map(([k, v]) => (
            <p key={k} className="text-sm mb-1"><span className="text-muted-foreground">{k}：</span>{String(v)}</p>
          ))}

          {/* Relations */}
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">关联关系</h3>
            {getEntityRelations(selected.id).map(r => {
              const other = r.source_id === selected.id
                ? entities.find(e => e.id === r.target_id)
                : entities.find(e => e.id === r.source_id);
              return (
                <div key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 p-1.5 rounded bg-muted/30">
                  <span className="font-mono">{r.source_id === selected.id ? '→' : '←'}</span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{r.type}</span>
                  <span className="font-medium">{other?.name || '未知'}</span>
                </div>
              );
            })}
            {getEntityRelations(selected.id).length === 0 && (
              <p className="text-xs text-muted-foreground">暂无关系</p>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card rounded-xl border p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">删除实体</h3>
            <p className="text-sm text-muted-foreground mb-4">
              确定要删除「{deleteTarget.name}」吗？相关的关联关系也将被删除。此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">取消</button>
              <button onClick={handleDeleteEntity} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-1">
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />} 删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
