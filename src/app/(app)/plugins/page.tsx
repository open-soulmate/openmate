"use client";
import dynamic from "next/dynamic";

const PluginsClient = dynamic(() => import("./plugins-client").then((m) => m.PluginsClient), { ssr: false });

export default function PluginsPage() {
  return <PluginsClient />;
}
