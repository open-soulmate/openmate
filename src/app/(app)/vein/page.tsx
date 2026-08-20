"use client";
import dynamic from "next/dynamic";
const VeinClient = dynamic(() => import("./vein-client").then((m) => m.VeinClient), { ssr: false });
export default function VeinPage() {
  return <VeinClient />;
}
