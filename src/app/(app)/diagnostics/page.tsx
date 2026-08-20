"use client";
import dynamic from "next/dynamic";
const DiagnosticsClient = dynamic(() => import("./diagnostics-client").then((m) => m.DiagnosticsClient), { ssr: false });
export default function DiagnosticsPage() {
  return <DiagnosticsClient />;
}
