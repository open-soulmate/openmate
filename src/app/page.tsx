'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/chat'); }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">加载中...</p>
    </div>
  );
}
