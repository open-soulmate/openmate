'use client';
import { useState, useEffect, useCallback } from 'react';
import { Network, Plus, Trash2, Save, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api-client';

interface Entity { id: string; name: string; type: string; description?: string; properties?: Record<string, unknown>; }
interface Relation { id: string; source_id: string; target_id: string; type: string; }

export function GraphBuilderClient() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('concept');
  const [newDesc, setNewDesc] = useState('');

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [eData, rData] = await Promise.all([api.getEntities(), api.getRelations()]);
      setEntities(Array.isArray(eData) ? eData : eData.items || eData.results || []);
      setRelations(Array.isArray(rData) ? rData : rData.items || rData.results || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="w-6 h-6" /> 知识图谱构建</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> 添加实体</button>
          </div>
        </div>
        {showAdd && (
          <div className="mb-4 p-4 rounded-lg border bg-card">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="实体名称" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
            <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm">
              <option value="concept">概念</option><option value="person">人物</option><option value="location">地点</option><option value="event">事件</option><option value="technology">技术</option><option value="organization">组织</option>
            </select>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm" />
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">创建</button>
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded border text-sm">取消</button>
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-4">{entities.length} 个实体，{relations.length} 个关系</p>
        {entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><Network className="w-12 h-12 mb-4 opacity-50" /><p>暂无图谱数据</p><p className="text-sm mt-1">添加知识库后自动生成，或手动添加实体</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {entities.map(e => (
              <div key={e.id} onClick={() => setSelected(e)} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selected?.id === e.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/50'}`}>
                <p className="font-medium text-sm">{e.name}</p>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted mt-1 inline-block">{e.type}</span>
                {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="w-80 border-l p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">{selected.name}</h2>
            <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
          <p className="text-sm mb-2"><span className="text-muted-foreground">类型：</span>{selected.type}</p>
          {selected.description && <p className="text-sm mb-2"><span className="text-muted-foreground">描述：</span>{selected.description}</p>}
          {selected.properties && Object.entries(selected.properties).map(([k, v]) => (
            <p key={k} className="text-sm mb-1"><span className="text-muted-foreground">{k}：</span>{String(v)}</p>
          ))}
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">关联关系</h3>
            {relations.filter(r => r.source_id === selected.id || r.target_id === selected.id).map(r => {
              const other = r.source_id === selected.id ? entities.find(e => e.id === r.target_id) : entities.find(e => e.id === r.source_id);
              return <p key={r.id} className="text-xs text-muted-foreground mb-1">{r.source_id === selected.id ? '→' : '←'} {r.type} {other?.name || '未知'}</p>;
            })}
            {relations.filter(r => r.source_id === selected.id || r.target_id === selected.id).length === 0 && <p className="text-xs text-muted-foreground">暂无关系</p>}
          </div>
        </div>
      )}
    </div>
  );
}
