'use client';
import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, RefreshCw, FolderOpen, ArrowDown, CheckCircle, XCircle, Loader2, Plus, Magnet, Video, Settings, Zap, Link, Pause, Play } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'pending' | 'downloading' | 'paused' | 'done' | 'error';
  type: 'http' | 'bt' | 'video' | 'thunder';
  error?: string;
  addedAt: number;
}

interface Config {
  threads: number;
  speed_limit: number;
  download_dir: string;
  proxy: string | null;
}

const STORAGE_KEY = 'openmate-downloads';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '--';
  return formatBytes(bps) + '/s';
}

function formatEta(s: number): string {
  if (s <= 0) return '--';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function detectUrlType(url: string): DownloadTask['type'] {
  if (url.startsWith('magnet:?')) return 'bt';
  if (url.startsWith('thunder://') || url.startsWith('flashget://') || url.startsWith('qqdl://')) return 'thunder';
  if (/youtube\.com|youtu\.be|bilibili\.com|b23\.tv|tiktok\.com|douyin\.com/i.test(url)) return 'video';
  return 'http';
}

function TypeTag({ type }: { type: DownloadTask['type'] }) {
  const styles: Record<string, string> = {
    http: 'bg-blue-500/10 text-blue-400',
    bt: 'bg-green-500/10 text-emerald-400',
    video: 'bg-purple-500/10 text-purple-400',
    thunder: 'bg-orange-500/10 text-orange-400',
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[type]}`}>{type.toUpperCase()}</span>;
}

export function DownloadClient() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [tab, setTab] = useState<'downloads' | 'done' | 'settings'>('downloads');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Config>({ threads: 8, speed_limit: 0, download_dir: '~/Downloads', proxy: null });

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setTasks(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }, [tasks]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/download/config`);
      if (res.ok) setConfig(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveConfig = async (key: string, value: string) => {
    try {
      await fetch(`${getApiBaseUrl()}/api/download/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      loadConfig();
    } catch {}
  };

  const startDownload = async () => {
    if (!newUrl.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/download/download/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, resume: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const filename = newUrl.split('/').pop()?.split('?')[0] || 'download';
        const task: DownloadTask = {
          id: `dl-${Date.now()}`, url: newUrl, filename,
          totalBytes: data.total_bytes || 0, downloadedBytes: data.downloaded_bytes || 0,
          speed: data.speed || 0, eta: data.eta || 0,
          status: data.status === 'done' ? 'done' : data.status === 'error' ? 'error' : 'downloading',
          type: detectUrlType(newUrl), error: data.error, addedAt: Date.now(),
        };
        setTasks(prev => [task, ...prev]);
        setNewUrl('');
        setShowAdd(false);
      }
    } catch {}
    setLoading(false);
  };

  const removeTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const togglePause = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'paused' ? 'downloading' : t.status === 'downloading' ? 'paused' : t.status } : t));

  const downloading = tasks.filter(t => t.status === 'downloading' || t.status === 'pending' || t.status === 'paused');
  const done = tasks.filter(t => t.status === 'done');
  const urlType = detectUrlType(newUrl);

  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="w-6 h-6" /> {t('download.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('download.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> {t('download.newDownload')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                placeholder={t('download.urlPlaceholder')}
                className="w-full px-4 py-2.5 pr-24 rounded-lg bg-muted text-sm outline-none border border-border focus:border-primary"
                onKeyDown={e => e.key === 'Enter' && startDownload()} />
              {newUrl && <span className="absolute right-3 top-1/2 -translate-y-1/2"><TypeTag type={urlType} /></span>}
            </div>
            <button onClick={startDownload} disabled={loading || !newUrl.trim()}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> {t('download.download')}</>}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Link className="w-3 h-3" /> HTTP/FTP</span>
            <span className="flex items-center gap-1"><Magnet className="w-3 h-3" /> BT/Magnet</span>
            <span className="flex items-center gap-1"><Video className="w-3 h-3" /> YouTube/Bilibili</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> thunder://</span>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        {([['downloads', t('download.downloading'), downloading.length], ['done', t('download.done'), done.length], ['settings', t('download.settings'), 0]] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === key ? 'bg-card text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'downloads' && (
        <div>
          {downloading.length === 0 && tasks.filter(t => t.status === 'error').length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('download.noTasks')}</p>
              <p className="text-sm mt-1">{t('download.noTasksHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.filter(t => t.status !== 'done').map(task => (
                <div key={task.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {task.status === 'downloading' && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
                        {task.status === 'paused' && <Pause className="w-4 h-4 text-yellow-500 shrink-0" />}
                        {task.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <h3 className="text-sm font-medium truncate">{task.filename}</h3>
                        <TypeTag type={task.type} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{task.url}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {task.status === 'downloading' && (
                        <button onClick={() => togglePause(task.id)} className="px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20">
                          <Pause className="w-3 h-3" />
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button onClick={() => togglePause(task.id)} className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20">
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => removeTask(task.id)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {task.status !== 'error' && (
                    <div className="mb-2">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${task.status === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`}
                          style={{ width: `${task.totalBytes > 0 ? (task.downloadedBytes / task.totalBytes * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {task.totalBytes > 0 && <span>{formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}</span>}
                    {task.speed > 0 && <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{formatSpeed(task.speed)}</span>}
                    {task.eta > 0 && <span>ETA: {formatEta(task.eta)}</span>}
                    {task.status === 'paused' && <span className="text-yellow-500">⏸ {t('download.paused')}</span>}
                    {task.status === 'error' && <span className="text-red-500">❌ {task.error || t('download.failed')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'done' && (
        <div>
          {done.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('download.noDone')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {done.map(task => (
                <div key={task.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <h3 className="text-sm font-medium truncate">{task.filename}</h3>
                      <TypeTag type={task.type} />
                      <span className="text-xs text-muted-foreground">{formatBytes(task.downloadedBytes)}</span>
                    </div>
                    <button onClick={() => removeTask(task.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="max-w-xl space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span className="text-lg font-medium">{t('download.engineConfig')}</span>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('download.threads')} (1-32)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={32} value={config.threads}
                  onChange={e => setConfig(c => ({ ...c, threads: parseInt(e.target.value) }))}
                  onMouseUp={() => saveConfig('threads', config.threads.toString())}
                  className="flex-1" />
                <span className="text-sm font-mono w-8 text-right">{config.threads}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('download.speedLimit')} (0={t('download.unlimited')})</label>
              <div className="flex items-center gap-2">
                <input type="number" value={config.speed_limit}
                  onChange={e => setConfig(c => ({ ...c, speed_limit: parseInt(e.target.value) || 0 }))}
                  onBlur={() => saveConfig('speed-limit', config.speed_limit.toString())}
                  className="w-32 px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none" />
                <span className="text-xs text-muted-foreground">bytes/s</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('download.downloadDir')}</label>
              <input type="text" value={config.download_dir}
                onChange={e => setConfig(c => ({ ...c, download_dir: e.target.value }))}
                onBlur={() => saveConfig('download-dir', config.download_dir)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('download.proxy')}</label>
              <input type="text" value={config.proxy || ''}
                onChange={e => setConfig(c => ({ ...c, proxy: e.target.value || null }))}
                onBlur={() => saveConfig('proxy', config.proxy || '')}
                className="w-full px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none font-mono"
                placeholder="http://127.0.0.1:7890" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-medium mb-3">{t('download.supportedProtocols')}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['HTTP/HTTPS', `✅ ${t('download.resumeSupport')}`],
                ['FTP', `✅ ${t('download.multiThread')}`],
                ['thunder://', `✅ ${t('download.thunderDecode')}`],
                ['flashget://', `✅ ${t('download.flashgetDecode')}`],
                ['qqdl://', `✅ ${t('download.qqdlDecode')}`],
                ['magnet:?xt=', `✅ ${t('download.btMagnet')}`],
                ['.torrent', `✅ ${t('download.torrent')}`],
                ['YouTube/Bilibili', `✅ ${t('download.videoExtract')}`],
              ].map(([proto, status]) => (
                <div key={proto} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="font-medium">{proto}</span>
                  <span className="text-muted-foreground">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
