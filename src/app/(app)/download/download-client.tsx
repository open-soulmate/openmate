'use client';
import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, RefreshCw, FolderOpen, ArrowDown, CheckCircle, XCircle, Loader2, Plus, Magnet, Video, Settings, Zap, HardDrive, Link, FileText, FileVideo, FileAudio, FileArchive, File, Copy, ExternalLink, Pause, Play } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'pending' | 'downloading' | 'paused' | 'done' | 'error';
  savePath?: string;
  type: 'http' | 'bt' | 'video' | 'thunder';
  error?: string;
  addedAt: number;
}

interface CacheFile {
  name: string;
  path: string;
  size: number;
  modified: number;
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
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60}秒`;
  return `${Math.floor(s / 3600)}时${Math.floor((s % 3600) / 60)}分`;
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
  const labels: Record<string, string> = { http: 'HTTP', bt: 'BT/磁力', video: '视频', thunder: '迅雷' };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[type]}`}>{labels[type]}</span>;
}

export function DownloadClient() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [cacheFiles, setCacheFiles] = useState<CacheFile[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [tab, setTab] = useState<'downloads' | 'cache' | 'settings'>('downloads');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Config>({ threads: 8, speed_limit: 0, download_dir: '~/Downloads', proxy: null });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load tasks
  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setTasks(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }, [tasks]);

  // Load cache
  const loadCache = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/download/cache`);
      if (res.ok) { const d = await res.json(); setCacheFiles(d.files || []); setCacheSize(d.total_size || 0); }
    } catch {}
  }, []);

  useEffect(() => { loadCache(); }, [loadCache]);

  // Load config
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/download/config`);
      if (res.ok) { const d = await res.json(); setConfig(d); setConfigLoaded(true); }
    } catch { setConfigLoaded(true); }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Save config
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

  // Start download
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
          savePath: data.save_path,
        };
        setTasks(prev => [task, ...prev]);
        setNewUrl('');
        setShowAdd(false);
        loadCache();
      }
    } catch {}
    setLoading(false);
  };

  const removeTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const togglePause = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'paused' ? 'downloading' : t.status === 'downloading' ? 'paused' : t.status } : t));
  const deleteFile = async (task: DownloadTask) => {
    if (!confirm(`确定删除 ${task.filename}？`)) return;
    try {
      await fetch(`${getApiBaseUrl()}/api/download/cache/${task.filename}`, { method: 'DELETE' });
      removeTask(task.id);
    } catch { removeTask(task.id); }
  };

  const togglePause = (id: string) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: t.status === 'paused' ? 'downloading' : 'paused' } : t
    ));
  };

  const openFileDir = async (task: DownloadTask) => {
    try {
      const filePath = task.savePath || `${config.download_dir}/${task.filename}`;
      await fetch(`${getApiBaseUrl()}/api/download/open-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
    } catch {}
  };

  const deleteFile = async (task: DownloadTask) => {
    try {
      const filePath = task.savePath || `${config.download_dir}/${task.filename}`;
      await fetch(`${getApiBaseUrl()}/api/download/delete-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      removeTask(task.id);
      loadCache();
    } catch {}
  };

  const urlType = detectUrlType(newUrl);

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="w-6 h-6" /> OpenWing 下载引擎</h1>
          <p className="text-sm text-muted-foreground mt-1">HTTP/BT/磁力/视频/迅雷 · 多线程断点续传 · 替代迅雷</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 text-sm hover:bg-primary/90">
            <Plus className="w-4 h-4" /> 新建下载
          </button>
        </div>
      </div>

      {/* Add download form */}
      {showAdd && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                placeholder="输入链接 (HTTP/FTP/magnet/thunder/YouTube/B站...)"
                className="w-full px-4 py-2.5 pr-20 rounded-lg bg-muted text-sm outline-none border border-border focus:border-primary"
                onKeyDown={e => e.key === 'Enter' && startDownload()} />
              {newUrl && <span className="absolute right-3 top-1/2 -translate-y-1/2"><TypeTag type={urlType} /></span>}
            </div>
            <button onClick={startDownload} disabled={loading || !newUrl.trim()}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> 下载</>}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Link className="w-3 h-3" /> HTTP/FTP</span>
            <span className="flex items-center gap-1"><Magnet className="w-3 h-3" /> 磁力链/BT</span>
            <span className="flex items-center gap-1"><Video className="w-3 h-3" /> YouTube/B站</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> thunder://</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        {([['downloads', '下载中'], ['done', '已完成'], ['settings', 'OpenWing设置']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === key ? 'bg-card text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
            {key === 'downloads' && tasks.length > 0 && <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 rounded-full">{tasks.length}</span>}
            {key === 'cache' && cacheFiles.length > 0 && <span className="ml-1 text-xs bg-muted-foreground/20 px-1.5 rounded-full">{cacheFiles.length}</span>}
          </button>
        ))}
      </div>

      {/* Downloads Tab */}
      {tab === 'downloads' && (
        <div>
          {tasks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">暂无下载任务</p>
              <p className="text-sm mt-1">点击&quot;新建下载&quot;开始 · 支持HTTP/BT/磁力/视频/迅雷链接</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => (
                <div key={task.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {task.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                        {task.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        {task.status === 'downloading' && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
                        {task.status === 'paused' && <Pause className="w-4 h-4 text-yellow-500 shrink-0" />}
                        <h3 className="text-sm font-medium truncate">{task.filename}</h3>
                        <TypeTag type={task.type} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{task.url}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {task.status === 'done' && (
                        <>
                          <button onClick={() => openFileDir(task)} className="px-2.5 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1" title="打开文件所在目录">
                            <FolderOpen className="w-3 h-3" /> 打开文件
                          </button>
                          <button onClick={() => deleteFile(task)} className="px-2.5 py-1 rounded-md text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-1" title="删除已下载文件">
                            <Trash2 className="w-3 h-3" /> 删除文件
                          </button>
                        </>
                      )}
                      {task.status === 'downloading' && (
                        <button onClick={() => togglePause(task.id)} className="px-2.5 py-1 rounded-md text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 flex items-center gap-1" title="暂停下载">
                          <Pause className="w-3 h-3" /> 暂停
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button onClick={() => togglePause(task.id)} className="px-2.5 py-1 rounded-md text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 flex items-center gap-1" title="继续下载">
                          <Play className="w-3 h-3" /> 继续
                        </button>
                      )}
                      {task.status === 'error' && (
                        <button onClick={() => removeTask(task.id)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="移除">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {task.status !== 'done' && (
                    <div className="mb-2">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${task.status === 'error' ? 'bg-red-500' : task.status === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`}
                          style={{ width: `${task.totalBytes > 0 ? (task.downloadedBytes / task.totalBytes * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {task.totalBytes > 0 && <span>{formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}</span>}
                    {task.status === 'done' && <span className="text-green-500">{formatBytes(task.downloadedBytes)}</span>}
                    {task.speed > 0 && task.status === 'downloading' && <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{formatSpeed(task.speed)}</span>}
                    {task.eta > 0 && task.status === 'downloading' && <span>ETA: {formatEta(task.eta)}</span>}
                    {task.status === 'done' && <span className="text-green-500">✅ 完成</span>}
                    {task.status === 'paused' && <span className="text-yellow-500">⏸ 已暂停</span>}
                    {task.status === 'error' && <span className="text-red-500">❌ {task.error || '失败'}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Download Files Tab */}
      {tab === 'done' && (() => {
        const doneList = tasks.filter(t => t.status === 'done');
        return (
        <div>
          {doneList.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">暂无已完成的下载</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doneList.map(task => (
                <div key={task.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <h3 className="text-sm font-medium truncate">{task.filename}</h3>
                      <TypeTag type={task.type} />
                      <span className="text-xs text-muted-foreground">{formatBytes(task.downloadedBytes)}</span>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button onClick={() => deleteFile(task)} className="p-1.5 rounded hover:bg-muted text-red-400" title="删除文件">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">下载目录: <strong className="font-mono">{config.download_dir}</strong></span>
            </div>
            <div className="flex gap-2">
              <button onClick={loadCache} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs flex items-center gap-1"><RefreshCw className="w-3 h-3" /> 刷新</button>
              <button onClick={() => window.open(`file://${config.download_dir}`, '_blank')} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs flex items-center gap-1"><ExternalLink className="w-3 h-3" /> 打开文件夹</button>
            </div>
          </div>
          {cacheFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>暂无下载文件</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cacheFiles.map(f => {
                const ext = f.name.split('.').pop()?.toLowerCase() || '';
                const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts'].includes(ext);
                const isAudio = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);
                const isArchive = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext);
                const isDoc = ['pdf', 'doc', 'docx', 'txt', 'md', 'epub'].includes(ext);
                const FileIcon = isVideo ? FileVideo : isAudio ? FileAudio : isArchive ? FileArchive : isDoc ? FileText : File;
                const iconColor = isVideo ? 'text-purple-400' : isAudio ? 'text-blue-400' : isArchive ? 'text-yellow-400' : isDoc ? 'text-green-400' : 'text-muted-foreground';
                const filePath = `${config.download_dir}/${f.name}`;
                return (
                  <div key={f.name}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => { navigator.clipboard.writeText(filePath); }}
                    title={`点击复制路径: ${filePath}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileIcon className={`w-5 h-5 shrink-0 ${iconColor}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{f.name}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(f.size)} · {new Date(f.modified * 1000).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="max-w-xl space-y-4">
          <div className="flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-muted-foreground" /><span className="text-lg font-medium">OpenWing 引擎配置</span></div>

          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">下载线程数 (1-32)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={32} value={config.threads}
                  onChange={e => { const v = parseInt(e.target.value); setConfig(c => ({ ...c, threads: v })); }}
                  onMouseUp={e => saveConfig('threads', config.threads.toString())}
                  className="flex-1" />
                <span className="text-sm font-mono w-8 text-right">{config.threads}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">速度限制 (0=无限)</label>
              <div className="flex items-center gap-2">
                <input type="number" value={config.speed_limit}
                  onChange={e => setConfig(c => ({ ...c, speed_limit: parseInt(e.target.value) || 0 }))}
                  onBlur={e => saveConfig('speed-limit', config.speed_limit.toString())}
                  className="w-32 px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none"
                  placeholder="0" />
                <span className="text-xs text-muted-foreground">bytes/s (0=无限制)</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">下载目录</label>
              <div className="flex items-center gap-2">
                <input type="text" value={config.download_dir}
                  onChange={e => setConfig(c => ({ ...c, download_dir: e.target.value }))}
                  onBlur={e => saveConfig('download-dir', config.download_dir)}
                  className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none font-mono" />
                <button className="px-3 py-2 rounded-lg border hover:bg-muted text-xs"><FolderOpen className="w-4 h-4" /></button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">代理</label>
              <input type="text" value={config.proxy || ''}
                onChange={e => setConfig(c => ({ ...c, proxy: e.target.value || null }))}
                onBlur={e => saveConfig('proxy', config.proxy || '')}
                className="w-full px-3 py-2 rounded-lg bg-muted text-sm border border-border focus:border-primary outline-none font-mono"
                placeholder="http://127.0.0.1:7890 (留空=不使用)" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-medium mb-3">支持的协议</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['HTTP/HTTPS', '✅ 多线程断点续传'],
                ['FTP', '✅ 多线程下载'],
                ['thunder://', '✅ 迅雷链接解码'],
                ['flashget://', '✅ 快车链接解码'],
                ['qqdl://', '✅ QQ旋风链接解码'],
                ['magnet:?xt=', '✅ BT/磁力链下载'],
                ['.torrent', '✅ 种子文件下载'],
                ['YouTube/B站', '✅ 视频提取下载'],
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
