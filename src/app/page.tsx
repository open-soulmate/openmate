'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const token = getToken();
    router.replace(token ? '/chat' : '/login');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">加载中...</p>
    </div>
  );
}
