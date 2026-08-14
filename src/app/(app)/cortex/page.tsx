"use client";
import dynamic from "next/dynamic";
const CortexClient = dynamic(() => import("./cortex-client").then(m => m.CortexClient), { ssr: false });
export default function CortexPage() { return <CortexClient />; }
