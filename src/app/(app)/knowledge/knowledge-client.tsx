'use client';
import { useState, useEffect, useRef } from 'react';
import { BookOpen, Plus, Trash2, Loader2, LogIn, Send, CheckCircle, XCircle, Clock, Share2, Sparkles, Upload, FileText, X } from 'lucide-react';
import { api, getUserId, setUserId, getApiBaseUrl } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface Knowledge { id: string; title: string; content?: string; starred?: boolean; pinned?: boolean; created_at?: string; metadata?: Record<string, unknown>; }
interface KbRequest { id: string; kb_name: string; kb_description: string; status: string; created_at: string; review_note?: string; }

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.txt,.md,.html,.htm,.csv,.json,.py,.js,.ts,.xml,.yaml,.yml,.toml,.sh,.log';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function KnowledgeClient() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [kbRequests, setKbRequests] = useState<KbRequest[]>([]);
  const [reqName, setReqName] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [dedupResult, setDedupResult] = useState<string>('');
  const [deduping, setDeduping] = useState(false);

  // File upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number; failed: number }>({ total: 0, done: 0, failed: 0 });
  const [uploadResult, setUploadResult] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); setShowLogin(true); return; }
    setLoading(true);
    try {
      const [data, reqs] = await Promise.all([api.getKnowledge(uid), api.getMyKbRequests()]);
      setItems(Array.isArray(data) ? data : data.items || data.results || []);
      setKbRequests(Array.isArray(reqs) ? reqs : []);
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
    setLoading(false);
  };

  const handleLogin = async () => {
    setError('');
    try {
      if (isRegister) {
        const res = await api.register(loginUser, loginPass, loginEmail || `${loginUser}@openmate.local`);
        setUserId(res.id || loginUser);
      } else {
        const res = await api.login(loginUser, loginPass);
        if (res.user_id) setUserId(res.user_id);
      }
      setShowLogin(false); setIsRegister(false);
      loadItems();
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const uid = getUserId(); if (!uid) { setShowLogin(true); return; }
    try {
      await api.createKnowledge(uid, { title: newTitle, content: newContent });
      setNewTitle(''); setNewContent(''); setShowCreate(false);
      loadItems();
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirm'))) return;
    try { await api.deleteKnowledge(id); loadItems(); } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleKbRequest = async () => {
    if (!reqName.trim()) return;
    try {
      await api.createKbRequest({ kb_name: reqName, kb_description: reqDesc });
      setReqName(''); setReqDesc(''); setShowRequest(false);
      loadItems();
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleShare = async (kbId: string, kbName: string) => {
    if (!confirm(`申请将"${kbName}"共享到企业知识库？`)) return;
    try {
      await api.createSharingRequest({ kb_id: kbId, kb_name: kbName });
      alert('共享申请已提交，等待管理员审批');
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleDedup = async () => {
    setDeduping(true);
    try {
      const uid = getUserId();
      const res = await fetch(`${getApiBaseUrl()}/api/dedup/deduplicate?user_id=${uid}`, { method: 'POST' });
      const data = await res.json();
      setDedupResult(`扫描${data.total}条，发现${data.duplicates_found}条重复，已清理${data.duplicates_removed}条`);
      loadItems();
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
    setDeduping(false);
  };

  // ── File Upload Handlers ───────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadFiles(prev => [...prev, ...Array.from(files)]);
      setUploadResult('');
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files) {
      setUploadFiles(prev => [...prev, ...Array.from(files)]);
      setUploadResult('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    const uid = getUserId();
    if (!uid) { setShowLogin(true); return; }

    setUploading(true);
    setUploadResult('');
    setUploadProgress({ total: uploadFiles.length, done: 0, failed: 0 });

    let succeeded = 0;
    let failed = 0;

    for (const file of uploadFiles) {
      try {
        await api.uploadKnowledge(uid, file, undefined, uploadTags);
        succeeded++;
      } catch (e) {
        failed++;
        console.error(`Failed to upload ${file.name}:`, e);
      }
      setUploadProgress({ total: uploadFiles.length, done: succeeded + failed, failed });
    }

    const parts = [];
    if (succeeded > 0) parts.push(`✅ ${succeeded} 个文件导入成功`);
    if (failed > 0) parts.push(`❌ ${failed} 个文件失败`);
    setUploadResult(parts.join('，'));

    if (succeeded > 0) {
      setUploadFiles([]);
      setUploadTags('');
      loadItems();
    }
    setUploading(false);
  };

  // 登录页
  if (showLogin) return (
    <div className="flex items-center justify-center h-full">
      <div className="p-6 rounded-lg border bg-card w-80">
        <h2 className="text-lg font-bold mb-4">{isRegister ? '注册账号' : '登录'}</h2>
        <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="用户名" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
        <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="密码" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
        {isRegister && <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="邮箱（可选）" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />}
        {error && <p className="text-xs text-destructive mb-2">{error}</p>}
        <button onClick={handleLogin} className="w-full px-3 py-2 rounded bg-primary text-primary-foreground text-sm mb-2">{isRegister ? '注册' : '登录'}</button>
        <button onClick={() => { setIsRegister(!isRegister); setError(''); }} className="w-full px-3 py-2 rounded border text-sm text-muted-foreground">{isRegister ? '已有账号？去登录' : '没有账号？去注册'}</button>
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // 审批状态显示
  const pendingReq = kbRequests.find(r => r.status === 'pending');
  const approvedReq = kbRequests.find(r => r.status === 'approved');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6" /> {t('knowledge.title')}</h1>
        <div className="flex gap-2">
          {items.length > 0 && <button onClick={handleDedup} disabled={deduping} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted"><Sparkles className="w-4 h-4" /> {deduping ? '去重中...' : '智能去重'}</button>}
          <button onClick={() => setShowRequest(!showRequest)} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted"><Send className="w-4 h-4" /> 申请知识库</button>
          <button onClick={() => { setShowUpload(!showUpload); setShowCreate(false); }} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted"><Upload className="w-4 h-4" /> 导入文件</button>
          <button onClick={() => { setShowCreate(!showCreate); setShowUpload(false); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> {t('knowledge.create')}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      {dedupResult && <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">{dedupResult}</div>}

      {/* 审批状态提示 */}
      {pendingReq && <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> 知识库"{pendingReq.kb_name}"申请审批中...</div>}

      {/* 申请知识库表单 */}
      {showRequest && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <h3 className="font-medium mb-2">申请创建知识库</h3>
          <p className="text-xs text-muted-foreground mb-3">提交申请后，管理员将在OpenSoul后台审批，审批通过后自动创建。</p>
          <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="知识库名称" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
          <textarea value={reqDesc} onChange={e => setReqDesc(e.target.value)} placeholder="描述（用途、内容范围等）" rows={2} className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={handleKbRequest} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">提交申请</button>
            <button onClick={() => setShowRequest(false)} className="px-4 py-2 rounded border text-sm">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* 文件导入面板 */}
      {showUpload && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> 导入文件到知识库</h3>
            <button onClick={() => { setShowUpload(false); setUploadFiles([]); setUploadResult(''); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">支持 PDF、DOCX、TXT、Markdown、HTML、CSV、JSON、代码文件等。文件将被自动解析、分块并建立向量索引。</p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-3 ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">拖拽文件到这里，或点击选择文件</p>
            <p className="text-xs text-muted-foreground/70 mt-1">支持批量上传，单文件最大 50MB</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Selected files list */}
          {uploadFiles.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{uploadFiles.length} 个文件已选择</span>
                <button onClick={() => setUploadFiles([])} className="text-xs text-muted-foreground hover:text-destructive">清空</button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {uploadFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 text-sm">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                    <button onClick={() => removeUploadFile(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <input
            value={uploadTags}
            onChange={e => setUploadTags(e.target.value)}
            placeholder="标签（可选，逗号分隔，如：技术文档,2024）"
            className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm"
          />

          {/* Upload button */}
          <div className="flex gap-2 items-center">
            <button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || uploading}
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50 flex items-center gap-1"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? `导入中 (${uploadProgress.done}/${uploadProgress.total})` : '开始导入'}
            </button>
            {uploading && (
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
          {uploadResult && (
            <div className={`mt-3 p-2 rounded text-sm ${uploadResult.includes('❌') ? 'bg-yellow-500/10 text-yellow-600' : 'bg-green-500/10 text-green-600'}`}>
              {uploadResult}
            </div>
          )}
        </div>
      )}

      {/* 新建知识条目 */}
      {showCreate && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="知识条目标题" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="知识内容" rows={4} className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">{t('common.create')}</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded border text-sm">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* 知识条目列表 */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p className="mb-2">{t('knowledge.empty')}</p>
          <p className="text-sm">先申请创建知识库，审批通过后即可添加知识</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const meta = item.metadata as Record<string, unknown> | undefined;
            const isFileImport = !!(meta?.original_filename);
            return (
              <div key={item.id} className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isFileImport && <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <h3 className="font-medium">{item.title}</h3>
                    </div>
                    {isFileImport && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{String(meta.content_type || '')}</span>
                        {meta.char_count != null && <span className="text-xs text-muted-foreground">{Number(meta.char_count).toLocaleString()} 字符</span>}
                      </div>
                    )}
                    {item.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{item.content}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleShare(item.id, item.title); }} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="共享到企业知识库"><Share2 className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {!!(meta)?.shared_to_enterprise && <div className="mt-2 text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已共享到企业知识库</div>}
                {item.created_at && <div className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
