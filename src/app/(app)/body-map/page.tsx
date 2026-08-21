"use client";
import dynamic from "next/dynamic";

const BodyMapClient = dynamic(() => import("./body-map-client").then((m) => m.BodyMapClient), { ssr: false });

export default function BodyMapPage() {
  return <BodyMapClient />;
}
