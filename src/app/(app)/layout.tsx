'use client';
import { useState, useEffect } from 'react';
import '@/styles/sidebar.css';
import { AppShell } from '@/components/app-shell';
import { Topbar } from '@/components/topbar';
import { CommandMenu } from '@/components/command-menu';
import { GlobalShortcuts } from '@/components/global-shortcuts';
import { LoginPage } from '@/components/login-page';
import { ToastProvider } from '@/components/toast-provider';
import { isLoggedIn } from '@/lib/api-client';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    setChecking(false);
  }, []);

  if (checking) return null;

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <ToastProvider>
      <AppShell>
        <Topbar />
        <main className="flex-1 overflow-hidden">{children}</main>
        <CommandMenu />
        <GlobalShortcuts />
      </AppShell>
    </ToastProvider>
  );
}
