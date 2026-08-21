"use client";
import dynamic from "next/dynamic";

const HippoClient = dynamic(() => import("./hippo-client").then((m) => m.HippoClient), { ssr: false });

export default function HippoPage() {
  return <HippoClient />;
}
