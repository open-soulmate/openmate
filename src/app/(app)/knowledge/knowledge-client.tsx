'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Loader2, LogIn, Send, CheckCircle, XCircle, Clock, Share2, Sparkles } from 'lucide-react';
import { api, getUserId, setUserId } from '@/lib/api-client';

interface Knowledge { id: string; title: string; content?: string; starred?: boolean; pinned?: boolean; created_at?: string; metadata?: Record<string, unknown>; }
interface KbRequest { id: string; kb_name: string; kb_description: string; status: string; created_at: string; review_note?: string; }

export function KnowledgeClient() {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); setShowLogin(true); return; }
    setLoading(true);
    try {
      const [data, reqs] = await Promise.all([api.getKnowledge(uid), api.getMyKbRequests()]);
      setItems(Array.isArray(data) ? data : data.items || data.results || []);
      setKbRequests(Array.isArray(reqs) ? reqs : []);
    } catch (e) { setError(`加载失败: ${(e as Error).message}`); }
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
    } catch (e) { setError(`${isRegister ? '注册' : '登录'}失败: ${(e as Error).message}`); }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const uid = getUserId(); if (!uid) { setShowLogin(true); return; }
    try {
      await api.createKnowledge(uid, { title: newTitle, content: newContent });
      setNewTitle(''); setNewContent(''); setShowCreate(false);
      loadItems();
    } catch (e) { setError(`创建失败: ${(e as Error).message}`); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try { await api.deleteKnowledge(id); loadItems(); } catch (e) { setError(`删除失败: ${(e as Error).message}`); }
  };

  const handleKbRequest = async () => {
    if (!reqName.trim()) return;
    try {
      await api.createKbRequest({ kb_name: reqName, kb_description: reqDesc });
      setReqName(''); setReqDesc(''); setShowRequest(false);
      loadItems();
    } catch (e) { setError(`申请失败: ${(e as Error).message}`); }
  };

  const handleShare = async (kbId: string, kbName: string) => {
    if (!confirm(`申请将"${kbName}"共享到企业知识库？`)) return;
    try {
      await api.createSharingRequest({ kb_id: kbId, kb_name: kbName });
      alert('共享申请已提交，等待管理员审批');
    } catch (e) { setError(`申请失败: ${(e as Error).message}`); }
  };

  const handleDedup = async () => {
    setDeduping(true);
    try {
      const uid = getUserId();
      const res = await fetch(`http://localhost:8090/api/dedup/deduplicate?user_id=${uid}`, { method: 'POST' });
      const data = await res.json();
      setDedupResult(`扫描${data.total}条，发现${data.duplicates_found}条重复，已清理${data.duplicates_removed}条`);
      loadItems();
    } catch (e) { setError(`去重失败: ${(e as Error).message}`); }
    setDeduping(false);
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
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6" /> 知识库</h1>
        <div className="flex gap-2">
          {items.length > 0 && <button onClick={handleDedup} disabled={deduping} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted"><Sparkles className="w-4 h-4" /> {deduping ? '去重中...' : '智能去重'}</button>}
          <button onClick={() => setShowRequest(!showRequest)} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 hover:bg-muted"><Send className="w-4 h-4" /> 申请知识库</button>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> 新建</button>
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
            <button onClick={() => setShowRequest(false)} className="px-4 py-2 rounded border text-sm">取消</button>
          </div>
        </div>
      )}

      {/* 新建知识条目 */}
      {showCreate && (
        <div className="mb-6 p-4 rounded-lg border bg-card">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="知识条目标题" className="w-full mb-2 px-3 py-2 rounded border bg-background text-sm" />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="知识内容" rows={4} className="w-full mb-3 px-3 py-2 rounded border bg-background text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">创建</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded border text-sm">取消</button>
          </div>
        </div>
      )}

      {/* 知识条目列表 */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p className="mb-2">还没有知识条目</p>
          <p className="text-sm">先申请创建知识库，审批通过后即可添加知识</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer group">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium">{item.title}</h3>
                  {item.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{item.content}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleShare(item.id, item.title); }} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="共享到企业知识库"><Share2 className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="删除"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {(item.metadata as Record<string, unknown>)?.shared_to_enterprise && <div className="mt-2 text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已共享到企业知识库</div>}
              {item.created_at && <div className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
