"use client";
import dynamic from "next/dynamic";

const AgentsClient = dynamic(() => import("./agents-client").then((m) => m.AgentsClient), { ssr: false });

export default function AgentsPage() {
  return <AgentsClient />;
}
