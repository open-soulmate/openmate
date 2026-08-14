"use client";
import dynamic from "next/dynamic";
const LimbClient = dynamic(() => import("./limb-client").then(m => m.LimbClient), { ssr: false });
export default function LimbPage() { return <LimbClient />; }
