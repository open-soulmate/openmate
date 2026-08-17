"use client";
import dynamic from "next/dynamic";
const VisionClient = dynamic(() => import("./vision-client").then(m => m.VisionClient), { ssr: false });
export default function VisionPage() { return <VisionClient />; }
