"use client";
import dynamic from "next/dynamic";

const GraphBuilderClient = dynamic(() => import("./graph-builder-client").then((m) => m.GraphBuilderClient), { ssr: false });

export default function GraphBuilderPage() {
  return <GraphBuilderClient />;
}
