import { CronDetailClient } from "./cron-detail-client";

export default async function CronDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CronDetailClient taskId={id} />;
}
