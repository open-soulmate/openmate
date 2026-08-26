'use client';
import { useState, useEffect, useCallback } from 'react';
import { Tags, Loader2, Plus, Trash2, Edit2, Save, X, Search, Tag } from 'lucide-react';
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface TagItem {
  id: string;
  name: string;
  color?: string;
  description?: string;
  usage_count?: number;
  created_at?: string;
}

export function TagsClient() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TagItem | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const base = getApiBaseUrl();
      const token = getToken();
      const userId = getUserId() || 'default';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/tags/?user_id=${userId}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTags(Array.isArray(data) ? data : data.items || data.tags || []);
    } catch (e) { setError(`${t('common.error', 'Error')}: ${(e as Error).message}`); }
    setLoading(false);
  }, [t]);

  useEffect(() => { loadTags(); }, [loadTags]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const base = getApiBaseUrl();
      const token = getToken();
      const userId = getUserId() || 'default';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/tags/?user_id=${userId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newName, color: newColor, description: newDesc }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowCreate(false);
      setNewName('');
      setNewColor('#3b82f6');
      setNewDesc('');
      loadTags();
    } catch (e) { setError(`${t('common.error', 'Error')}: ${(e as Error).message}`); }
    setCreating(false);
  };

  const handleUpdate = async (id: string) => {
    try {
      const base = getApiBaseUrl();
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/tags/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: editName, color: editColor, description: editDesc }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditId(null);
      loadTags();
    } catch (e) { setError(`${t('common.error', 'Error')}: ${(e as Error).message}`); }
  };

  const handleDelete = async (id: string) => {
    try {
      const base = getApiBaseUrl();
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/tags/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteTarget(null);
      loadTags();
    } catch (e) { setError(`${t('common.error', 'Error')}: ${(e as Error).message}`); }
  };

  const startEdit = (tag: TagItem) => {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || '#3b82f6');
    setEditDesc(tag.description || '');
  };

  const filtered = tags.filter((tag) =>
    !search || tag.name.toLowerCase().includes(search.toLowerCase()) ||
    (tag.description && tag.description.toLowerCase().includes(search.toLowerCase()))
  );

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tags className="w-6 h-6" /> {t('nav.tags', '标签管理')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('tags.description', '管理知识库和内容的标签分类')}</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('tags.newTag', '新建标签')}
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600 text-sm">{error}</div>}

      {showCreate && (
        <div className="p-4 border rounded-lg bg-card space-y-4">
          <h3 className="font-medium">{t('tags.createTitle', '创建新标签')}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('tags.name', '标签名称')}</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background" placeholder={t('tags.namePlaceholder', '输入标签名称')} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('tags.color', '颜色')}</label>
              <div className="flex gap-1 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('tags.desc', '描述')}</label>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background" placeholder={t('tags.descPlaceholder', '可选描述')} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('common.create', '创建')}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-md hover:bg-accent">{t('common.cancel', '取消')}</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('tags.search', '搜索标签...')} className="w-full pl-9 pr-3 py-2 border rounded-md bg-background" />
        </div>
        <span className="text-sm text-muted-foreground">{t('tags.total', '共 {count} 个标签').replace('{count}', String(tags.length))}</span>
        <button onClick={loadTags} className="ml-auto text-sm text-muted-foreground hover:text-foreground">{t('common.refresh', '刷新')}</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('tags.empty', '暂无标签')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((tag) => (
            <div key={tag.id} className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
              {editId === tag.id ? (
                <div className="space-y-3">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-2 py-1 border rounded text-sm bg-background" />
                  <div className="flex gap-1">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => setEditColor(c)} className={`w-5 h-5 rounded-full border ${editColor === c ? 'border-foreground' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full px-2 py-1 border rounded text-sm bg-background" placeholder={t('tags.desc', '描述')} />
                  <div className="flex gap-1">
                    <button onClick={() => handleUpdate(tag.id)} className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs">{t('common.save', '保存')}</button>
                    <button onClick={() => setEditId(null)} className="px-2 py-1 border rounded text-xs">{t('common.cancel', '取消')}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                    <span className="font-medium">{tag.name}</span>
                    {tag.usage_count !== undefined && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{tag.usage_count}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(tag)} className="p-1 text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                    {deleteTarget?.id === tag.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(tag.id)} className="px-1.5 py-0.5 bg-red-500 text-white rounded text-xs">{t('common.confirm', '确认')}</button>
                        <button onClick={() => setDeleteTarget(null)} className="px-1.5 py-0.5 border rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteTarget(tag)} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              )}
              {tag.description && editId !== tag.id && (
                <p className="text-xs text-muted-foreground mt-2">{tag.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
