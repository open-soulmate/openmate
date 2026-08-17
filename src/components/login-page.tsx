'use client';
import { useState, useEffect } from 'react';
import { LogIn, UserPlus, Loader2, Settings, ChevronDown, Check, Wifi, Eye, EyeOff } from 'lucide-react';
import { setApiBaseUrl, getApiBaseUrl, setUserId, setToken } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

function api() {
  const base = getApiBaseUrl();
  return {
    login: (username: string, password: string) => {
      const body = new URLSearchParams({ username, password });
      return fetch(`${base}/api/user/login`, { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
    },
    register: (username: string, password: string, email: string) =>
      fetch(`${base}/api/user/register`, { method: 'POST', body: JSON.stringify({ username, password, email }), headers: { 'Content-Type': 'application/json' } }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
  };
}

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'register' | 'login'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverAddr, setServerAddr] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const { t } = useTranslation();

  useEffect(() => {
    const saved = getApiBaseUrl();
    setServerAddr(saved);
    // Test connection
    testConnection(saved);
  }, []);

  const testConnection = async (url: string) => {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
      setConnStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setConnStatus('fail');
    }
  };

  const handleSaveServer = () => {
    const url = serverAddr.trim().replace(/\/+$/, '');
    if (!url) return;
    setApiBaseUrl(url);
    testConnection(url);
    setShowSettings(false);
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) { setError(t('login.usernamePasswordRequired')); return; }
    setLoading(true); setError('');
    try {
      const a = api();
      if (mode === 'register') {
        const res = await a.register(username, password, email || `${username}@openmate.local`);
        setUserId(res.id);
      } else {
        const res = await a.login(username, password);
        if (res.user_id) { setUserId(username); setToken(res.access_token); }
        else throw new Error(t('login.loginFailed'));
      }
      onLogin();
    } catch (e) {
      const msg = (e as Error).message;
      if (mode === 'login' && msg.includes('401')) setError(t('login.invalidCredentials'));
      else if (mode === 'register' && msg.includes('400')) setError(t('login.usernameExists'));
      else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) setError(t('login.connectionError'));
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
          <p className="text-sm text-muted-foreground mt-1">{mode === 'register' ? t('login.createAccount') : t('login.loginToContinue')}</p>
        </div>

        {/* Server Address */}
        <div className="mb-4">
          <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
            <Wifi className={`w-3 h-3 ${connStatus === 'ok' ? 'text-green-500' : connStatus === 'fail' ? 'text-red-500' : ''}`} />
            <span suppressHydrationWarning className="truncate flex-1 text-left">{getApiBaseUrl()}</span>
            <Settings className="w-3 h-3" />
          </button>
          {showSettings && (
            <div className="mt-2 flex gap-2">
              <input value={serverAddr} onChange={e => setServerAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveServer()}
                placeholder="http://127.0.0.1:8090" className="flex-1 px-3 py-2 rounded-lg border bg-background text-xs" />
              <button onClick={handleSaveServer} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                <Check className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder={t('login.username')} className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" autoFocus />
        <div className="relative w-full mb-3">
          <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder={t('login.password')} className="w-full px-4 py-3 pr-10 rounded-lg border bg-background text-sm" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {mode === 'register' && <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder={t('login.emailOptional')} className="w-full mb-3 px-4 py-3 rounded-lg border bg-background text-sm" />}

        {error && <p className="text-xs text-destructive mb-3 text-center">{error}</p>}

        <button onClick={handleSubmit} disabled={loading} className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 mb-3">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
          {loading ? t('login.pleaseWait') : mode === 'register' ? t('login.register') : t('login.login')}
        </button>

        <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }} className="w-full px-4 py-2 rounded-lg border text-sm text-muted-foreground hover:bg-muted">
          {mode === 'register' ? t('login.hasAccountLogin') : t('login.noAccountRegister')}
        </button>
      </div>
    </div>
  );
}
