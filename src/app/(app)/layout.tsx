'use client';
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { Topbar } from '@/components/topbar';
import { CommandMenu } from '@/components/command-menu';
import { LoginPage } from '@/components/login-page';
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
    <div className="flex h-screen overflow-hidden">
      <AppShell />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}
