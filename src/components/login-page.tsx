'use client';
import { useState, useEffect } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { api, getUserId, setUserId } from '@/lib/api-client';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.login(username, password);
      if (res.user_id) {
        setUserId(res.user_id);
        onLogin();
      }
    } catch (e) {
      setError(`登录失败: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="p-8 rounded-xl border bg-card w-96 shadow-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">OpenMate</h1>
          <p className="text-sm text-muted-foreground mt-1">登录以继续</p>
        </div>
        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="用户名" className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" autoFocus />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="密码" className="w-full mb-4 px-4 py-3 rounded-lg border bg-background text-sm" />
        {error && <p className="text-xs text-destructive mb-3 text-center">{error}</p>}
        <button onClick={handleLogin} disabled={loading} className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {loading ? '登录中...' : '登录'}
        </button>
      </div>
    </div>
  );
}
