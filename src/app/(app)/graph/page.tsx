"use client";
import dynamic from "next/dynamic";

const GraphClient = dynamic(() => import("./graph-client").then((m) => m.GraphClient), { ssr: false });

export default function GraphPage() {
  return <GraphClient />;
}
