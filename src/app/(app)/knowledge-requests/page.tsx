"use client";
import dynamic from "next/dynamic";

const KnowledgeRequestsClient = dynamic(() => import("./knowledge-requests-client").then((m) => m.KnowledgeRequestsClient), { ssr: false });

export default function KnowledgeRequestsPage() {
  return <KnowledgeRequestsClient />;
}
