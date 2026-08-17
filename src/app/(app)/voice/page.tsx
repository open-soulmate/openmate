"use client";
import dynamic from "next/dynamic";
const VoiceClient = dynamic(() => import("./voice-client").then(m => m.VoiceClient), { ssr: false });
export default function VoicePage() { return <VoiceClient />; }
