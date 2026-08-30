"use client";
import dynamic from "next/dynamic";
const SystemClient = dynamic(() => import("./system-client").then((m) => m.SystemClient), { ssr: false });
export default function SystemPage() {
  return <SystemClient />;
}
