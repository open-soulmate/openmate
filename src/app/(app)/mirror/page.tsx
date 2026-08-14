"use client";
import dynamic from "next/dynamic";
const MirrorClient = dynamic(() => import("./mirror-client").then(m => m.MirrorClient), { ssr: false });
export default function MirrorPage() { return <MirrorClient />; }
