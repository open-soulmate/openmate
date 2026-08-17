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
    if (!confirm(t('knowledge.t30668', { kbName: kbName }))) return;
    try {
      await api.createSharingRequest({ kb_id: kbId, kb_name: kbName });
      alert(t('knowledge.t09045'));
    } catch (e) { setError(`${t('common.error')}: ${(e as Error).message}`); }
  };

  const handleDedup = async () => {
    setDeduping(true);
    try {
      const uid = getUserId();
      const res = await fetch(`${getApiBaseUrl()}/api/dedup/deduplicate?user_id=${uid}`, { method: 'POST' });
      const data = await res.json();
      setDedupResult(t('knowledge.t39777', { total: data.total, duplicatesfound: data.duplicates_found, duplicatesremoved: data.duplicates_removed }));
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
        console.error(`Failed to upload ${file.name}:t('knowledge.t52699')border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-3 ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }t('knowledge.t91534')${file.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/50 text-sm">
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
            placeholder=t('knowledge.t48363')
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
              {uploading ? t('knowledge.t15083', { done: uploadProgress.done, total: uploadProgress.total }) : t('knowledge.t29573')}
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

      {/* {t('knowledge.t11013')}*/}
      {showCreate && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder=t('knowledge.t74692') className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder=t('knowledge.t99236') rows={4} className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">{t('common.create')}</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded border text-sm">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* {t('knowledge.t76894')}*/}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p className="mb-2">{t('knowledge.empty')}</p>
          <p className="text-sm">{t('knowledge.t30463')}<p>
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
                        {meta.char_count != null && <span className="text-xs text-muted-foreground">{Number(meta.char_count).toLocaleString()} {t('knowledge.t23729')}</span>}
                      </div>
                    )}
                    {item.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{item.content}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleShare(item.id, item.title); }} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title=t('knowledge.t71805')><Share2 className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {!!(meta)?.shared_to_enterprise && <div className="mt-2 text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t('knowledge.t42127')}<div>}
                {item.created_at && <div className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
