'use client';
import { useState } from 'react';
import { Search as SearchIcon, FileText, Tag, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';

interface SearchResult { id: string; title: string; content?: string; score?: number; type?: string; tags?: string[]; }

export function SearchClient() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const data = await api.search(query);
      setResults(Array.isArray(data) ? data : data.results || data.items || []);
    } catch (e) {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><SearchIcon className="w-6 h-6" /> 统一搜索</h1>
      <div className="flex gap-2 mb-6">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="搜索知识库、文档、实体..." className="flex-1 px-4 py-3 rounded-lg border bg-background text-sm" />
        <button onClick={handleSearch} disabled={loading} className="px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}</button>
      </div>
      {loading && <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
      {!loading && searched && results.length === 0 && <div className="text-center py-20 text-muted-foreground"><SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>未找到相关结果</p></div>}
      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">找到 {results.length} 个结果</p>
          {results.map(r => (
            <div key={r.id} className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-medium">{r.title}</h3>
                  {r.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{r.content}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {r.type && <span className="text-xs px-2 py-0.5 rounded bg-muted">{r.type}</span>}
                    {r.tags?.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1"><Tag className="w-3 h-3" />{t}</span>)}
                    {r.score !== undefined && <span className="text-xs text-muted-foreground ml-auto">相关度: {(r.score * 100).toFixed(0)}%</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!searched && <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><SearchIcon className="w-12 h-12 mb-4 opacity-50" /><p>输入关键词搜索你的知识库</p></div>}
    </div>
  );
}
