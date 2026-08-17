'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  FileCode, Plus, Search, Tag, Star, Trash2, Save, X, Check,
  Loader2, CheckCircle2, XCircle, Hash, RefreshCw, Copy, Pin,
  ChevronDown, Edit3, Eye, ArrowUpRight, Download, Upload, Code2,
} from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';


interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string;
  tags: string[];
  starred: boolean;
  pinned: boolean;
  description: string;
  filename: string;
  created_at: number;
  updated_at: number;
  access_count: number;
}

interface Stats {
  total: number;
  starred: number;
  pinned: number;
  by_language: Record<string, number>;
  top_tags: Record<string, number>;
  total_access_count: number;
  supported_languages: number;
}

const API = () => `${getApiBaseUrl()}/api/plugins/snippets`;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

function timeAgo(ts: number): string {
  const diff = Date.now() - ts * 1000;
  if (diff < 60000) return t('common.justNow');
  if (diff < 3600000) return t('plugins.t40479', { floordiff60000: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('plugins.t42408', { floordiff3600000: Math.floor(diff / 3600000) });
  return t('plugins.t01212', { floordiff86400000: Math.floor(diff / 86400000) });
}

const LANG_COLORS: Record<string, string> = {
  python: '#3572A5', javascript: '#f1e05a', typescript: '#3178c6',
  tsx: '#3178c6', jsx: '#f1e05a', html: '#e34c26', css: '#563d7c',
  rust: '#dea584', go: '#00ADD8', java: '#b07219', ruby: '#701516',
  php: '#4F5D95', c: '#555555', cpp: '#f34b7d', csharp: '#178600',
  bash: '#89e051', sh: '#89e051', sql: '#e38c00', json: '#292929',
  yaml: '#cb171e', markdown: '#083fa1', dockerfile: '#384d54',
  text: '#6e7681',
};

export function SnippetsClient() {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLang, setFilterLang] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterStarred, setFilterStarred] = useState(false);
  const [allTags, setAllTags] = useState<{ name: string; count: number }[]>([]);
  const [allLanguages, setAllLanguages] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  // Form state
  const [form, setForm] = useState({
    title: '', content: '', language: 'text', tags: [] as string[],
    description: '', filename: '', starred: false, pinned: false,
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSnippets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (filterLang) params.set('language', filterLang);
      if (filterTag) params.set('tag', filterTag);
      if (filterStarred) params.set('starred', 'true');
      params.set('limit', '200');

      const res = await fetch(`${API()}/snippets?${params}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSnippets(data.snippets || []);
      }
    } catch (e) {
      console.error('Failed to fetch snippets:', e);
    }
    setLoading(false);
  }, [searchQuery, filterLang, filterTag, filterStarred]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch(`${API()}/tags`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setAllTags(data.tags || []);
      }
    } catch {}
  }, []);

  const fetchLanguages = useCallback(async () => {
    try {
      const res = await fetch(`${API()}/languages`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setAllLanguages(data.languages || []);
      }
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API()}/stats`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSnippets();
    fetchTags();
    fetchLanguages();
    fetchStats();
  }, [fetchSnippets, fetchTags, fetchLanguages, fetchStats]);

  const openCreate = () => {
    setForm({ title: '', content: '', language: 'text', tags: [], description: '', filename: '', starred: false, pinned: false });
    setIsCreating(true);
    setEditingSnippet(null);
    setTagInput('');
  };

  const openEdit = (snippet: Snippet) => {
    setForm({
      title: snippet.title, content: snippet.content, language: snippet.language,
      tags: [...snippet.tags], description: snippet.description,
      filename: snippet.filename, starred: snippet.starred, pinned: snippet.pinned,
    });
    setEditingSnippet(snippet);
    setIsCreating(false);
    setTagInput('');
  };

  const closeEditor = () => { setEditingSnippet(null); setIsCreating(false); };

  const handleSave = async () => {
    const body = { ...form };
    try {
      let res;
      if (editingSnippet) {
        res = await fetch(`${API()}/snippets/${editingSnippet.id}`, {
          method: 'PUT', headers: headers(), body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API()}/snippets`, {
          method: 'POST', headers: headers(), body: JSON.stringify(body),
        });
      }
      if (res.ok) {
        showToast(editingSnippet ? t('plugins.t78989') : t('plugins.t27945'));
        closeEditor();
        fetchSnippets();
        fetchTags();
        fetchStats();
      } else {
        showToast(t('plugins.saveFailed'), 'error');
      }
    } catch { showToast(t('common.networkError'), 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('plugins.t41901'))) return;
    try {
      const res = await fetch(`${API()}/snippets/${id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) {
        showToast(t('plugins.t18660'));
        fetchSnippets();
        fetchTags();
        fetchStats();
      }
    } catch { showToast(t('common.deleteFailed'), 'error'); }
  };

  const handleStar = async (id: string) => {
    try {
      const res = await fetch(`${API()}/snippets/${id}/star`, { method: 'POST', headers: headers() });
      if (res.ok) fetchSnippets();
    } catch {}
  };

  const handleCopy = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API()}/exportt('plugins.t02775')flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${filterStarred ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500' : 'border-border hover:bg-accent'}`}>
          <Star className={`h-3.5 w-3.5 ${filterStarred ? 'fill-yellow-500' : ''}`} />  {t('plugins.t69600')}
        <button>
        <div className="flex rounded-lg border border-border">
          <button onClick={() => setViewMode('grid')} className={`px-2.5 py-2 text-xs ${viewMode === 'grid' ? 'bg-accent' : ''}`}>
            <div className="grid grid-cols-2 gap-0.5"><div className="h-1.5 w-1.5 bg-current"/><div className="h-1.5 w-1.5 bg-current"/><div className="h-1.5 w-1.5 bg-current"/><div className="h-1.5 w-1.5 bg-current"/></div>
          </button>
          <button onClick={() => setViewMode('list')} className={`px-2.5 py-2 text-xs border-l border-border ${viewMode === 'list' ? 'bg-accent' : ''}`}>
            ☰
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredSnippetList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileCode className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">{t('plugins.t78571')}<p>
            <button onClick={openCreate} className="mt-3 text-xs text-primary hover:underline">{t('plugins.t95909')}<button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredSnippetList.map(s => (
              <div key={s.id} className="group relative flex flex-col rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {s.pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
                      <h3 className="truncate text-sm font-medium">{s.title || t('capture.untitled')}</h3>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: (LANG_COLORS[s.language] || '#6e7681') + '20', color: LANG_COLORS[s.language] || '#6e7681' }}>
                        <Code2 className="h-2.5 w-2.5" /> {s.language}
                      </span>
                      {s.filename && <span className="truncate text-[10px] text-muted-foreground">{s.filename}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleStar(s.id)} className="rounded p-1 hover:bg-accent" title=t('plugins.t69600')>
                      <Star className={`h-3.5 w-3.5 ${s.starred ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                    </button>
                    <button onClick={() => handleCopy(s)} className="rounded p-1 hover:bg-accent" title=t('common.copy')>
                      {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => openEdit(s)} className="rounded p-1 hover:bg-accent" title=t('common.edit')>
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="rounded p-1 hover:bg-accent hover:text-red-500" title=t('common.delete')>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {/* Code preview */}
                <div className="flex-1 overflow-hidden px-4 py-2.5">
                  <pre className="max-h-32 overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground leading-relaxed">{s.content.slice(0, 300)}</pre>
                </div>
                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {s.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                    {s.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{s.tags.length - 3}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(s.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="space-y-1">
            {filteredSnippetList.map(s => (
              <div key={s.id} className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 hover:shadow-sm">
                <button onClick={() => handleStar(s.id)} className="shrink-0">
                  <Star className={`h-4 w-4 ${s.starred ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                </button>
                {s.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary fill-primary" />}
                <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: (LANG_COLORS[s.language] || '#6e7681') + '20', color: LANG_COLORS[s.language] || '#6e7681' }}>
                  {s.language}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{s.title || t('capture.untitled')}</span>
                  {s.description && <span className="ml-2 text-xs text-muted-foreground truncate">{s.description}</span>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {s.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(s.updated_at)}</span>
                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleCopy(s)} className="rounded p-1 hover:bg-accent" title=t('common.copy')>
                    {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => openEdit(s)} className="rounded p-1 hover:bg-accent"><Edit3 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(s.id)} className="rounded p-1 hover:bg-accent hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {(isCreating || editingSnippet) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <h2 className="text-base font-semibold">{editingSnippet ? t('plugins.t99531') : t('plugins.t66914')}</h2>
              <button onClick={closeEditor} className="rounded-lg p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('echo.title_label')}<label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder=t('plugins.t39199') />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('settings.language')}<label>
                  <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
                    {allLanguages.length > 0 ? allLanguages.map(l => <option key={l} value={l}>{l}</option>) : (
                      ['text','python','javascript','typescript','tsx','html','css','rust','go','java','bash','sql','json','yaml','markdown'].map(l => <option key={l} value={l}>{l}</option>)
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('vein.fileName')}<label>
                  <input value={form.filename} onChange={e => setForm({ ...form, filename: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder=t('plugins.t84583') />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('marrow.description')}<label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder=t('plugins.t04780') />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('knowledge.tags')}<label>
                <div className="flex flex-wrap items-center gap-2">
                  {form.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="min-w-[120px] flex-1 bg-transparent text-sm outline-none" placeholder=t('plugins.t36851') />
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('plugins.t53067')}<label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                  className="h-64 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary resize-none" placeholder=t('plugins.t51328') />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.starred} onChange={e => setForm({ ...form, starred: e.target.checked })} className="rounded" />
                  <Star className="h-3.5 w-3.5" />  {t('plugins.t69600')}
                <label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="rounded" />
                  <Pin className="h-3.5 w-3.5" />  {t('plugins.t44706')}
                <label>
              </div>
            </div>
            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-3">
              <button onClick={closeEditor} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">{t('common.cancel')}<button>
              <button onClick={handleSave} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                <Save className="h-4 w-4" /> {editingSnippet ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
