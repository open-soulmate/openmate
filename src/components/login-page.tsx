'use client';
import { useState } from 'react';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';
import { api, setUserId, setToken } from '@/lib/api-client';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) { setError('用户名和密码不能为空'); return; }
    setLoading(true); setError('');
    try {
      if (mode === 'register') {
        const res = await api.register(username, password, email || `${username}@openmate.local`);
        setUserId(res.id);
      } else {
        const res = await api.login(username, password);
        if (res.user_id) { setUserId(res.user_id); setToken(res.access_token); }
        else throw new Error('登录失败');
      }
      onLogin();
    } catch (e) {
      const msg = (e as Error).message;
      if (mode === 'login' && msg.includes('401')) setError('用户名或密码错误');
      else if (mode === 'register' && msg.includes('400')) setError('用户名已存在');
      else setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="p-8 rounded-xl border bg-card w-96 shadow-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            {mode === 'register' ? <UserPlus className="w-8 h-8 text-primary" /> : <LogIn className="w-8 h-8 text-primary" />}
          </div>
          <h1 className="text-2xl font-bold">OpenMate</h1>
          <p className="text-sm text-muted-foreground mt-1">{mode === 'register' ? '创建账号以开始使用' : '登录以继续'}</p>
        </div>

        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="用户名" className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" autoFocus />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="密码" className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" />
        {mode === 'register' && <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="邮箱（可选）" className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" />}

        {error && <p className="text-xs text-destructive mb-3 text-center">{error}</p>}

        <button onClick={handleSubmit} disabled={loading} className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 mb-3">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
          {loading ? '请稍候...' : mode === 'register' ? '注册' : '登录'}
        </button>

        <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }} className="w-full px-4 py-2 rounded-lg border text-sm text-muted-foreground hover:bg-muted">
          {mode === 'register' ? '已有账号？去登录' : '没有账号？去注册'}
        </button>
      </div>
    </div>
  );
}
