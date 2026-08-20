"use client";
import dynamic from "next/dynamic";
const CaptureClient = dynamic(() => import("./capture-client").then((m) => m.CaptureClient), { ssr: false });
export default function CapturePage() {
  return <CaptureClient />;
}
