"use client";
import dynamic from "next/dynamic";

const KnowledgeClient = dynamic(() => import("./knowledge-client").then((m) => m.KnowledgeClient), { ssr: false });

export default function KnowledgePage() {
  return <KnowledgeClient />;
}
