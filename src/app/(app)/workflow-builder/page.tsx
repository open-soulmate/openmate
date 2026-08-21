"use client";
import dynamic from "next/dynamic";

const WorkflowBuilderClient = dynamic(() => import("./workflow-builder-client").then((m) => m.WorkflowBuilderClient), { ssr: false });

export default function WorkflowBuilderPage() {
  return <WorkflowBuilderClient />;
}
