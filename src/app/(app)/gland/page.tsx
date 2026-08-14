"use client";
import dynamic from "next/dynamic";
const GlandClient = dynamic(() => import("./gland-client").then(m => m.GlandClient), { ssr: false });
export default function GlandPage() { return <GlandClient />; }
