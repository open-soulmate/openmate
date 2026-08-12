'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Search, Star, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';

interface Knowledge { id: string; title: string; description?: string; starred?: boolean; pinned?: boolean; document_count?: number; created_at?: string; }

export function KnowledgeClient() {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await api.getKnowledge();
      setItems(Array.isArray(data) ? data : data.items || data.results || []);
    } catch (e) { setError(`加载失败: ${(e as Error).message}`); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      await api.createKnowledge({ title: newTitle, description: newDesc });
      setNewTitle(''); setNewDesc(''); setShowCreate(false);
      loadItems();
    } catch (e) { setError(`创建失败: ${(e as Error).message}`); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try { await api.deleteKnowledge(id); loadItems(); } catch (e) { setError(`删除失败: ${(e as Error).message}`); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6" /> 知识库</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"><Plus className="w-4 h-4" /> 新建</button>
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      {showCreate && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="知识库名称" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">创建</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded border text-sm">取消</button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><BookOpen className="w-12 h-12 mb-4 opacity-50" /><p>还没有知识库，点击"新建"开始</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer group">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium flex items-center gap-2">{item.pinned && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />} {item.title}</h3>
                  {item.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                {item.document_count !== undefined && <span>{item.document_count} 个文档</span>}
                {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
