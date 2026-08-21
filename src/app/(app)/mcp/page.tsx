"use client";
import dynamic from "next/dynamic";

const McpClient = dynamic(() => import("./mcp-client").then((m) => m.McpClient), { ssr: false });

export default function McpPage() {
  return <McpClient />;
}
