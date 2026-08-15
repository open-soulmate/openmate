'use client';
import { useState, useCallback } from 'react';
import { Search as SearchIcon, FileText, Tag, Loader2, Zap, BookOpen, Layers, RotateCcw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface SearchResult {
  id: string;
  title: string;
  content?: string;
  score?: number;
  type?: string;
  tags?: string[];
  source?: string;
  created_at?: string;
}

export function SearchClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<"hybrid" | "semantic" | "fulltext">("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);

  const MODES = [
    { id: "hybrid" as const, label: t('search.hybrid'), icon: Layers, desc: t('search.hybridDesc') },
    { id: "semantic" as const, label: t('search.semantic'), icon: Zap, desc: t('search.semanticDesc') },
    { id: "fulltext" as const, label: t('search.fulltext'), icon: BookOpen, desc: t('search.fulltextDesc') },
  ];

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const start = Date.now();
    try {
      const res = await fetch(`${apiBase}/api/search/?q=${encodeURIComponent(query)}&mode=${mode}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data.results || data.items || []);
      setSearchTime(Date.now() - start);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [query, mode, apiBase]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <SearchIcon size={18} className="text-primary" />
          {t('search.title')}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('search.subtitle')}</p>
      </div>

      {/* Search area */}
      <div className="border-b border-border px-6 py-4 space-y-3">
        {/* Mode selector */}
        <div className="flex gap-1.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors border",
                mode === m.id
                  ? "border-primary/30 bg-primary/5 text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <m.icon size={13} />
              {m.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={t('search.inputPlaceholder')}
              className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <SearchIcon size={15} />}
            {t('search.button')}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">{t('search.searching')}</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <SearchIcon size={40} className="mb-3 opacity-30" />
            <p className="text-sm">{t('search.noResultsGeneric')}</p>
            <p className="text-xs mt-1">{t('search.tryDifferent')}</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {t('search.foundResults', { count: results.length })}
              </p>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={11} />
                {searchTime}ms
              </span>
            </div>
            {results.map((r, i) => (
              <div
                key={r.id || i}
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <FileText size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium group-hover:text-primary transition-colors">{r.title}</h3>
                    {r.content && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{r.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {r.type && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                          {r.type}
                        </span>
                      )}
                      {r.score !== undefined && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">
                          {t('search.matchScore', { score: (r.score * 100).toFixed(0) })}
                        </span>
                      )}
                      {r.tags?.map(t => (
                        <span key={t} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-primary/10 text-primary">
                          <Tag size={9} />
                          {t}
                        </span>
                      ))}
                      {r.source && (
                        <span className="text-[10px] text-muted-foreground">{t('search.source')}: {r.source}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <SearchIcon size={40} className="mb-3 opacity-30" />
            <p className="text-sm">{t('search.enterKeywords')}</p>
            <div className="mt-4 flex gap-2">
              {[t('search.hintDocs'), t('search.hintMeetings'), t('search.hintTech')].map(hint => (
                <button
                  key={hint}
                  onClick={() => { setQuery(hint); }}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
