"use client";
import dynamic from "next/dynamic";

const SettingsClient = dynamic(() => import("./settings-client").then((m) => m.SettingsClient), { ssr: false });

export default function SettingsPage() {
  return <SettingsClient />;
}
