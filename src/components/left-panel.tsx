'use client';
import { useState, useMemo, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeftPanelProps<T> {
  /** Items to display */
  items: T[];
  /** Custom filter function — return true to include item */
  filter: (item: T, query: string) => boolean;
  /** Render each item */
  renderItem: (item: T) => ReactNode;
  /** Optional header content below search */
  header?: ReactNode;
  /** Optional empty state */
  emptyState?: ReactNode;
  /** Search placeholder text */
  placeholder?: string;
  /** Additional className */
  className?: string;
}

export function LeftPanel<T>({
  items,
  filter,
  renderItem,
  header,
  emptyState,
  placeholder = '搜索...',
  className,
}: LeftPanelProps<T>) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter(item => filter(item, query.trim().toLowerCase()));
  }, [items, query, filter]);

  return (
    <div className={cn('flex flex-col h-full min-w-0', className)}>
      {/* Search bar */}
      <div className="px-2 flex items-center justify-center h-12 shrink-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
        <div className="relative flex-1 group-data-[collapsible=icon]:hidden">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-muted/50 rounded-md border border-border focus:outline-none focus:border-primary/50 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Optional header */}
      {header}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length > 0 ? (
          filtered.map(item => renderItem(item))
        ) : (
          emptyState || (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">无匹配结果</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
