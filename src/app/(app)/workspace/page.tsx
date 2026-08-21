"use client";
import dynamic from "next/dynamic";

const WorkspaceClient = dynamic(() => import("./workspace-client").then((m) => m.WorkspaceClient), { ssr: false });

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
