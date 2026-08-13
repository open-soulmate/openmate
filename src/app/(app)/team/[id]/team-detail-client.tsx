'use client';
import { use } from 'react';
export function TeamDetailClient({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id } = use(paramsPromise);
  return <div className="p-6"><h1 className="text-xl font-bold">Team: {id}</h1><p className="text-muted-foreground mt-2">详情页面开发中...</p></div>;
}
