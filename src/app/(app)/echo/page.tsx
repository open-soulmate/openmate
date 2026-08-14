"use client";
import dynamic from "next/dynamic";
const EchoClient = dynamic(() => import("./echo-client").then(m => m.EchoClient), { ssr: false });
export default function EchoPage() { return <EchoClient />; }
