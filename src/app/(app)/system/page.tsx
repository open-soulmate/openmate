"use client";
import dynamic from "next/dynamic";
const SystemClient = dynamic(() => import("./system-client").then((m) => m.SystemOverviewClient), { ssr: false });
// Note: export name is SystemOverviewClient in system-client.tsx
export default function SystemPage() {
  return <SystemClient />;
}
