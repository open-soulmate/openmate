import WorkspaceDetailClient from "./workspace-detail-client";

export default function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <WorkspaceDetailClient />;
}
