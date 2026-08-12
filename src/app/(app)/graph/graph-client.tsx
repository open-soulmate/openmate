'use client';
import { useState, useEffect } from 'react';
import { Network, Loader2 } from 'lucide-react';
import { api, getUserId } from '@/lib/api-client';

interface Entity { id: string; name: string; type?: string; properties?: Record<string, unknown>; }
interface Relation { id: string; source_id: string; target_id: string; type: string; }

export function GraphClient() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entity | null>(null);

  useEffect(() => { loadGraph(); }, []);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const uid = getUserId() || 'default';
      const [eData, rData] = await Promise.all([api.getEntities(uid), api.getRelations()]);
      setEntities(Array.isArray(eData) ? eData : eData.items || eData.results || []);
      setRelations(Array.isArray(rData) ? rData : rData.items || rData.results || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Network className="w-6 h-6" /> 知识图谱</h1>
        {entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><Network className="w-12 h-12 mb-4 opacity-50" /><p>暂无图谱数据</p><p className="text-sm mt-1">添加知识库后自动生成</p></div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">{entities.length} 个实体，{relations.length} 个关系</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {entities.map(e => (
                <div key={e.id} onClick={() => setSelected(e)} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selected?.id === e.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/50'}`}>
                  <p className="font-medium text-sm">{e.name}</p>
                  {e.type && <span className="text-xs px-1.5 py-0.5 rounded bg-muted mt-1 inline-block">{e.type}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {selected && (
        <div className="w-80 border-l p-6 overflow-y-auto">
          <h2 className="font-bold mb-4">{selected.name}</h2>
          {selected.type && <p className="text-sm mb-2"><span className="text-muted-foreground">类型：</span>{selected.type}</p>}
          {selected.properties && Object.entries(selected.properties).map(([k, v]) => (
            <p key={k} className="text-sm mb-1"><span className="text-muted-foreground">{k}：</span>{String(v)}</p>
          ))}
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">关联关系</h3>
            {relations.filter(r => r.source_id === selected.id || r.target_id === selected.id).map(r => {
              const other = r.source_id === selected.id ? entities.find(e => e.id === r.target_id) : entities.find(e => e.id === r.source_id);
              return <p key={r.id} className="text-xs text-muted-foreground mb-1">{r.source_id === selected.id ? '→' : '←'} {r.type} {other?.name || '未知'}</p>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
