"use client";
import dynamic from "next/dynamic";
const SomaConnectorClient = dynamic(() => import("./soma-connector-client").then(m => m.SomaConnectorClient), { ssr: false });
export default function SomaConnectorPage() { return <SomaConnectorClient />; }
