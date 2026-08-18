"use client";
import dynamic from "next/dynamic";
const DiscoveryClient = dynamic(() => import("./discovery-client").then(m => m.DiscoveryClient), { ssr: false });
export default function DiscoveryPage() { return <DiscoveryClient />; }
