'use client';
import { useState, useEffect, useCallback } from 'react';
import { GitBranch, GitCommit, GitFork, FileDiff, Check, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface GitStatus {
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
  ahead: number;
  behind: number;
  loading: boolean;
}

interface GitStatusBarProps {
  apiBase: string;
  token: string;
  onRunCommand?: (command: string) => void;
}

export function GitStatusBar({ apiBase, token, onRunCommand }: GitStatusBarProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GitStatus>({
    branch: '',
    modified: 0,
    staged: 0,
    untracked: 0,
    ahead: 0,
    behind: 0,
    loading: false,
  });
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [committing, setCommitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${apiBase}/api/git/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus({
          branch: data.branch || 'main',
          modified: data.modified || 0,
          staged: data.staged || 0,
          untracked: data.untracked || 0,
          ahead: data.ahead || 0,
          behind: data.behind || 0,
          loading: false,
        });
      }
    } catch {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleGitCommand = useCallback(
    (command: string) => {
      onRunCommand?.(command);
    },
    [onRunCommand]
  );

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      const res = await fetch(`${apiBase}/api/git/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: commitMessage }),
      });
      if (res.ok) {
        setCommitMessage('');
        setShowCommitInput(false);
        fetchStatus();
      }
    } catch {
      // ignore
    }
    setCommitting(false);
  }, [apiBase, token, commitMessage, fetchStatus]);

  return (
    <div className="border-b border-border bg-[#111118]">
      {/* Main status bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        {/* Branch name */}
        <div className="flex items-center gap-1 text-muted-foreground">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="font-mono">{status.branch || '—'}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-3 bg-border" />

        {/* Status indicators */}
        <div className="flex items-center gap-3">
          {status.modified > 0 && (
            <button
              onClick={() => handleGitCommand('git diff')}
              className="flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors"
              title={t('git.viewChanges')}
            >
              <FileDiff className="w-3 h-3" />
              <span>{status.modified} {t('git.modified')}</span>
            </button>
          )}
          {status.staged > 0 && (
            <button
              onClick={() => handleGitCommand('git diff --staged')}
              className="flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
              title={t('git.viewStaged')}
            >
              <Check className="w-3 h-3" />
              <span>{status.staged} {t('git.staged')}</span>
            </button>
          )}
          {status.untracked > 0 && (
            <span className="text-muted-foreground/60">
              {status.untracked} {t('git.untracked')}
            </span>
          )}
          {(status.ahead > 0 || status.behind > 0) && (
            <div className="flex items-center gap-1 text-muted-foreground/60">
              <GitFork className="w-3 h-3" />
              {status.ahead > 0 && <span>↑{status.ahead}</span>}
              {status.behind > 0 && <span>↓{status.behind}</span>}
            </div>
          )}
          {status.modified === 0 && status.staged === 0 && status.untracked === 0 && (
            <span className="text-green-500/80">{t('git.clean')}</span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh button */}
        <button
          onClick={fetchStatus}
          disabled={status.loading}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted/50"
          title={t('git.refresh')}
        >
          <RefreshCw className={cn('w-3 h-3', status.loading && 'animate-spin')} />
        </button>
      </div>

      {/* Quick action buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border/50">
        <button
          onClick={() => handleGitCommand('git status')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>status</span>
        </button>
        <button
          onClick={() => handleGitCommand('git diff')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>diff</span>
        </button>
        <button
          onClick={() => handleGitCommand('git add .')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>add all</span>
        </button>
        <button
          onClick={() => setShowCommitInput(!showCommitInput)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
            showCommitInput
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <GitCommit className="w-3 h-3" />
          <span>commit</span>
        </button>
        <button
          onClick={() => handleGitCommand('git push')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>push</span>
        </button>
        <button
          onClick={() => handleGitCommand('git pull')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>pull</span>
        </button>
      </div>

      {/* Commit message input */}
      {showCommitInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50 bg-[#0d0d14]">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommit();
              }
              if (e.key === 'Escape') {
                setShowCommitInput(false);
                setCommitMessage('');
              }
            }}
            placeholder={t('git.commitPlaceholder')}
            className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded border border-border/50 focus:outline-none focus:border-primary/50"
            autoFocus
          />
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || committing}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
              commitMessage.trim() && !committing
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {committing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>{t('git.commit')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
