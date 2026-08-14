"use client";
import dynamic from "next/dynamic";
const SenseClient = dynamic(() => import("./sense-client").then(m => m.SenseClient), { ssr: false });
export default function SensePage() { return <SenseClient />; }
