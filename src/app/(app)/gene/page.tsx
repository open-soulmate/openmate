"use client";
import dynamic from "next/dynamic";

const GeneClient = dynamic(() => import("./gene-client").then((m) => m.GeneClient), { ssr: false });

export default function GenePage() {
  return <GeneClient />;
}
