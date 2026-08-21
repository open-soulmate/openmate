'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { getToken } from '@/lib/api-client';

export default function HomePage() {
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => {
    const token = getToken();
    router.replace(token ? '/chat' : '/login');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );
}
