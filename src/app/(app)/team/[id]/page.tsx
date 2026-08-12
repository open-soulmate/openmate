import TeamDetailClient from "./team-detail-client";

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <TeamDetailClient paramsPromise={params} />;
}
