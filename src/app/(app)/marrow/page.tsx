"use client";
import dynamic from "next/dynamic";

const MarrowClient = dynamic(() => import("./marrow-client").then((m) => m.MarrowClient), { ssr: false });

export default function MarrowPage() {
  return <MarrowClient />;
}
