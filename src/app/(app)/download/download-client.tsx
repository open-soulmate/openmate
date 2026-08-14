'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Pause, Play, Trash2, RefreshCw, FolderOpen, ArrowDown, ArrowUp, CheckCircle, XCircle, Loader2, Link, HardDrive, Zap, Wifi, Plus, Search, Square, SquareCheck } from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  dest: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'pending' | 'downloading' | 'paused' | 'done' | 'error';
  plugin: string;
  supportsResume: boolean;
  error?: string;
  addedAt: number;
}

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  status: string;
  supports_resume: boolean;
  supports_p2p: boolean;
  priority: number;
}

interface CacheFile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

const STORAGE_KEY = 'openmate-downloads';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '--';
  return formatBytes(bytesPerSec) + '/s';
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '--';
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
}

function getPluginIcon(id: string) {
  switch (id) {
    case 'aria2': return '🚀';
    case 'axel': return '⚡';
    case 'curl-resume': return '🔗';
    case 'wget': return '📥';
    case 'rsync': return '🔄';
    case 'curl': return '🌐';
    default: return '📦';
  }
}

export function DownloadClient() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [cacheFiles, setCacheFiles] = useState<CacheFile[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [downloadPath, setDownloadPath] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("openmate-download-path") || "~/Downloads";
    return "~/Downloads";
  });
  const [newUrl, setNewUrl] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<string>('');
  const [tab, setTab] = useState<'downloads' | 'cache' | 'plugins'>('downloads');
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load tasks from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTasks(JSON.parse(saved));
    } catch {}
  }, []);

  // Save tasks to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  localStorage.setItem("openmate-download-path", downloadPath);
  }, [tasks]);

  // Load plugins and cache
  const loadPlugins = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/api/download/plugins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlugins(data.plugins || []);
      }
    } catch {}
  }, []);

  const loadCache = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/api/download/cache`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCacheFiles(data.files || []);
        setCacheSize(data.total_size || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadPlugins();
    loadCache();
  }, [loadPlugins, loadCache]);

  // Start download
  const startDownload = async () => {
    if (!newUrl.trim()) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/api/download/download/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, dest: downloadPath + "/" + (newUrl.split("/").pop()?.split("?")[0] || "download"), plugin_id: selectedPlugin || undefined, resume: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const filename = newUrl.split('/').pop()?.split('?')[0] || 'download';
        const task: DownloadTask = {
          id: `dl-${Date.now()}`,
          url: newUrl,
          filename,
          dest: data.dest || '',
          totalBytes: data.total_bytes || 0,
          downloadedBytes: data.downloaded_bytes || 0,
          speed: 0,
          eta: 0,
          status: data.status === 'done' ? 'done' : data.status === 'error' ? 'error' : 'downloading',
          plugin: data.plugin || '',
          supportsResume: data.supports_resume || false,
          error: data.error,
          addedAt: Date.now(),
        };
        setTasks(prev => [task, ...prev]);
        setNewUrl('');
        setShowAdd(false);
        loadCache();
      }
    } catch {}
    setLoading(false);
  };

  // Update plugin
  const updatePlugin = async (pluginId: string) => {
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/plugins/${pluginId}/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadPlugins();
    } catch {}
  };

  // Update all plugins
  const updateAllPlugins = async () => {
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/plugins/update-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadPlugins();
    } catch {}
  };

  // Install plugin
  const installPlugin = async (pluginId: string) => {
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/plugins/${pluginId}/install`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadPlugins();
    } catch {}
  };

  // Batch plugin operation
  const batchPluginAction = async (action: 'install' | 'uninstall' | 'update') => {
    if (selectedPlugins.length === 0) return;
    const confirmMsg = action === 'install' ? '批量安装' : action === 'uninstall' ? '批量卸载' : '批量更新';
    if (!confirm(`确定${confirmMsg} ${selectedPlugins.length} 个插件？`)) return;
    setBatchLoading(true);
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/plugins/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, plugin_ids: selectedPlugins }),
      });
      setSelectedPlugins([]);
      loadPlugins();
    } catch {}
    setBatchLoading(false);
  };

  // Toggle single plugin selection
  const togglePluginSelect = (pluginId: string) => {
    setSelectedPlugins(prev =>
      prev.includes(pluginId) ? prev.filter(id => id !== pluginId) : [...prev, pluginId]
    );
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedPlugins.length === plugins.length) {
      setSelectedPlugins([]);
    } else {
      setSelectedPlugins(plugins.map(p => p.id));
    }
  };

  // Delete cache file
  const deleteCacheFile = async (filename: string) => {
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/cache/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadCache();
    } catch {}
  };

  // Clear all cache
  const clearCache = async () => {
    if (!confirm('确定清空所有缓存？')) return;
    try {
      const token = getToken();
      await fetch(`${getApiBaseUrl()}/api/download/cache`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadCache();
    } catch {}
  };

  // Remove task from list
  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const activeTasks = tasks.filter(t => t.status === 'downloading' || t.status === 'pending');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const errorTasks = tasks.filter(t => t.status === 'error');

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="w-6 h-6" /> 下载管理</h1>
          <p className="text-sm text-muted-foreground mt-1">支持断点续传、多协议、P2P · 替代迅雷等下载工具</p>
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
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="输入下载链接 (HTTP/FTP/磁力链...)"
              className="flex-1 px-4 py-2.5 rounded-lg bg-muted text-sm outline-none border border-border focus:border-primary"
              onKeyDown={e => e.key === 'Enter' && startDownload()} />
            <select value={selectedPlugin} onChange={e => setSelectedPlugin(e.target.value)}
              className="px-3 py-2.5 rounded-lg bg-muted text-sm border border-border outline-none">
              <option value="">自动选择协议</option>
              {plugins.filter(p => p.status === 'available').map(p => (
                <option key={p.id} value={p.id}>{getPluginIcon(p.id)} {p.name} {p.supports_resume ? '(续传)' : ''} {p.supports_p2p ? '(P2P)' : ''}</option>
              ))}
            </select>
            <button onClick={startDownload} disabled={loading || !newUrl.trim()}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '开始下载'}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">保存到:</span>
            <input value={downloadPath} onChange={e => setDownloadPath(e.target.value)} placeholder="~/Downloads" className="flex-1 px-3 py-1.5 rounded-lg bg-muted text-xs outline-none border border-border" />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>🚀 自动选择最优协议</span>
            <span>📥 支持断点续传</span>
            <span>🔄 失败自动重试</span>
            <span>📁 缓存可离线使用</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setTab('downloads')} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === 'downloads' ? 'bg-card text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          下载列表 {tasks.length > 0 && <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 rounded-full">{tasks.length}</span>}
        </button>
        <button onClick={() => setTab('cache')} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === 'cache' ? 'bg-card text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          缓存管理 {cacheFiles.length > 0 && <span className="ml-1 text-xs bg-muted-foreground/20 px-1.5 rounded-full">{cacheFiles.length}</span>}
        </button>
        <button onClick={() => setTab('plugins')} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === 'plugins' ? 'bg-card text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          协议插件
        </button>
      </div>

      {/* Downloads Tab */}
      {tab === 'downloads' && (
        <div>
          {tasks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">暂无下载任务</p>
              <p className="text-sm mt-1">点击"新建下载"开始</p>
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
                        {task.status === 'paused' && <Pause className="w-4 h-4 text-amber-500 shrink-0" />}
                        <h3 className="text-sm font-medium truncate">{task.filename}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{task.url}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {task.supportsResume && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">续传</span>}
                      {task.plugin && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{getPluginIcon(task.plugin)} {task.plugin}</span>}
                      <button onClick={() => removeTask(task.id)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="移除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {task.status !== 'done' && (
                    <div className="mb-2">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${task.status === 'error' ? 'bg-red-500' : task.status === 'paused' ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${task.totalBytes > 0 ? (task.downloadedBytes / task.totalBytes * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {task.totalBytes > 0 && <span>{formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}</span>}
                    {task.status === 'done' && <span className="text-green-500">{formatBytes(task.downloadedBytes)}</span>}
                    {task.speed > 0 && <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{formatSpeed(task.speed)}</span>}
                    {task.eta > 0 && <span>ETA: {formatEta(task.eta)}</span>}
                    {task.status === 'done' && <span className="text-green-500">✅ 完成</span>}
                    {task.status === 'error' && <span className="text-red-500">❌ {task.error || '失败'}</span>}
                    {task.dest && <span className="text-muted-foreground/50 truncate max-w-xs">{task.dest}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cache Tab */}
      {tab === 'cache' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">缓存大小: <strong>{formatBytes(cacheSize)}</strong></span>
            </div>
            <div className="flex gap-2">
              <button onClick={loadCache} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs flex items-center gap-1"><RefreshCw className="w-3 h-3" /> 刷新</button>
              {cacheFiles.length > 0 && (
                <button onClick={clearCache} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/5 text-xs">清空缓存</button>
              )}
            </div>
          </div>

          {cacheFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>暂无缓存文件</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cacheFiles.map(f => (
                <div key={f.name} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(f.size)} · {new Date(f.modified * 1000).toLocaleString()}</div>
                    </div>
                  </div>
                  <button onClick={() => deleteCacheFile(f.name)} className="p-1.5 rounded hover:bg-muted text-muted-foreground ml-2" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plugins Tab */}
      {tab === 'plugins' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">下载协议插件 · 自动选择最优协议</p>
            <button onClick={updateAllPlugins} className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> 一键更新全部
            </button>
          </div>

          {/* Batch action bar */}
          <div className="flex items-center justify-between mb-3 p-3 rounded-xl border bg-card">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                {selectedPlugins.length === plugins.length && plugins.length > 0 ? (
                  <SquareCheck className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
                全选
              </button>
              {selectedPlugins.length > 0 && (
                <span className="text-xs text-muted-foreground">已选 {selectedPlugins.length} 个</span>
              )}
            </div>
            {selectedPlugins.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => batchPluginAction('install')}
                  disabled={batchLoading}
                  className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 text-xs flex items-center gap-1 disabled:opacity-50"
                >
                  {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  批量安装
                </button>
                <button
                  onClick={() => batchPluginAction('update')}
                  disabled={batchLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-xs flex items-center gap-1 disabled:opacity-50"
                >
                  {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  批量更新
                </button>
                <button
                  onClick={() => batchPluginAction('uninstall')}
                  disabled={batchLoading}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs flex items-center gap-1 disabled:opacity-50"
                >
                  {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  批量卸载
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plugins.map(p => (
              <div key={p.id} className={`rounded-xl border bg-card p-4 transition-colors ${selectedPlugins.includes(p.id) ? 'border-primary/50 bg-primary/5' : ''}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => togglePluginSelect(p.id)} className="mt-1 shrink-0 hover:text-primary transition-colors">
                    {selectedPlugins.includes(p.id) ? (
                      <SquareCheck className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <span className="text-2xl shrink-0">{getPluginIcon(p.id)}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium">{p.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {p.version && <span className="text-[10px] text-muted-foreground">v{p.version}</span>}
                      {p.supports_resume && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">断点续传</span>}
                      {p.supports_p2p && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">P2P</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.status === 'available' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">已安装</span>
                    ) : (
                      <button onClick={() => installPlugin(p.id)} className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90">安装</button>
                    )}
                    {p.status === 'available' && (
                      <button onClick={() => updatePlugin(p.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="更新">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Plugin priority chain */}
          <div className="mt-6 p-4 rounded-xl border bg-card">
            <h3 className="text-sm font-medium mb-3">🔄 自动降级链（优先级从左到右）</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {plugins.sort((a, b) => a.priority - b.priority).map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
                  <span className={`text-xs px-2 py-1 rounded-lg ${p.status === 'available' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground line-through'}`}>
                    {getPluginIcon(p.id)} {p.name}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
