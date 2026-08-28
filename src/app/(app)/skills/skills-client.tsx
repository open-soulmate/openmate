'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, Download, Check, Trash2, Play, Loader2, CheckCircle2, XCircle, Puzzle, RefreshCw, ExternalLink, Package } from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface Skill {
  name: string;
  description: string;
  category: string;
  installed: boolean;
  version?: string;
  path?: string;
}

export function SkillsClient() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');
  const [category, setCategory] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [migrating, setMigrating] = useState(false);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      // Fetch local installed skills
      const localRes = await fetch(`${getApiBaseUrl()}/api/skills`, { headers });
      const localData = localRes.ok ? await localRes.json() : { skills: [] };
      const localSkills = localData.skills || [];

      // Fetch online marketplace skills
      try {
        const marketRes = await fetch(`${getApiBaseUrl()}/api/marketplace/sync/skills`, { headers });
        if (marketRes.ok) {
          const marketData = await marketRes.json();
          const onlineSkills = (marketData.skills || []).map((s: any) => ({
            name: s.name, description: s.description, category: s.category || s.source_name,
            installed: localSkills.some((l: any) => l.name === s.name),
            version: s.version, source: s.source_name,
          }));
          // Merge: local skills + online skills not already installed
          const localNames = new Set(localSkills.map((s: any) => s.name));
          const merged = [...localSkills, ...onlineSkills.filter((s: any) => !localNames.has(s.name))];
          setSkills(merged);
        } else {
          setSkills(localSkills);
        }
      } catch {
        setSkills(localSkills);
      }
    } catch (e) { console.error('Failed to fetch skills:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/skills/migrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.count > 0) {
        setToast({ message: `${t('skills.migrateDone')} (${data.count})`, type: "success" });
      } else {
        setToast({ message: t('skills.migrateDone'), type: "success" });
      }
      fetchSkills();
    } catch { setToast({ message: t('skills.migrating'), type: "error" }); }
    setMigrating(false);
  };

  const handleInstall = async (skill: Skill) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/skills/${skill.name}/install`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `${skill.name} ${t('skills.install')}`, type: 'success' });
        fetchSkills();
      } else {
        setToast({ message: data.error || t('skills.uninstall'), type: 'error' });
      }
    } catch { setToast({ message: 'Error', type: 'error' }); }
  };

  const handleUninstall = async (skill: Skill) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/skills/${skill.name}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setToast({ message: `${skill.name} ${t('skills.uninstall')}`, type: 'success' });
        fetchSkills();
      }
    } catch { setToast({ message: 'Error', type: 'error' }); }
  };

  // Get unique categories
  const categories = ['all', ...new Set(skills.map(s => s.category).filter(Boolean))];

  // Filter
  const filtered = skills.filter(s => {
    const matchQuery = s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'installed' ? s.installed : !s.installed);
    const matchCategory = category === 'all' || s.category === category;
    return matchQuery && matchFilter && matchCategory;
  });

  const installedCount = skills.filter(s => s.installed).length;

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 h-full overflow-y-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg ${toast.type === 'success' ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-red-500/40 bg-red-500/10 text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2"><Puzzle className="w-6 h-6" /> {t('skills.title')}</h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1">{t('skills.description')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleMigrate} disabled={migrating}
            className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-xs lg:text-sm disabled:opacity-50">
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {migrating ? t('skills.migrating') : t('skills.migrate')}
          </button>
          <button onClick={fetchSkills} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-xs lg:text-sm"><RefreshCw className="w-4 h-4" /> {t('skills.refresh')}</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 lg:gap-4 mb-6">
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-primary">{skills.length}</p><p className="text-[10px] lg:text-sm text-muted-foreground truncate">{t('skills.available')}</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-green-500">{installedCount}</p><p className="text-[10px] lg:text-sm text-muted-foreground truncate">{t('skills.installed')}</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-muted-foreground">{skills.length - installedCount}</p><p className="text-[10px] lg:text-sm text-muted-foreground truncate">{t('skills.available')}</p></div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('skills.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-muted text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'installed', 'available'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>
              {f === 'all' ? t('skills.all') : f === 'installed' ? t('skills.filterInstalled') : t('skills.filterAvailable')}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`px-2.5 py-1 rounded-md text-xs transition-colors ${category === c ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {c === 'all' ? t('skills.all') : c}
            </button>
          ))}
        </div>
      )}

      {/* Skills Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package size={48} className="mb-4 opacity-30" />
          <p className="text-xs lg:text-sm">{t('skills.noSkills')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-4">
          {filtered.map(skill => (
            <div key={skill.name} className={`rounded-xl border bg-card p-4 transition-all hover:border-primary/30 ${skill.installed ? 'border-green-500/20' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Puzzle size={18} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs lg:text-sm font-medium">{skill.name}</h3>
                    {skill.category && <span className="text-[10px] text-muted-foreground">{skill.category}</span>}
                  </div>
                </div>
                {skill.installed && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">{skill.description || t('skills.description')}</p>

              <div className="flex items-center justify-between">
                {skill.installed ? (
                  <div className="flex items-center gap-1.5">
                    {skill.version && <span className="text-[10px] text-muted-foreground">v{skill.version}</span>}
                    <button onClick={() => handleUninstall(skill)} className="px-2 py-1 rounded-lg text-xs border border-red-500/30 text-red-500 hover:bg-red-500/5 flex items-center gap-1">
                      <Trash2 size={10} />{t('skills.uninstall')}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleInstall(skill)} className="px-2.5 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1">
                    <Download size={10} />{t('skills.install')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
