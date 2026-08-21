"use client";
import dynamic from "next/dynamic";

const ImmuneClient = dynamic(() => import("./immune-client").then((m) => m.ImmuneClient), { ssr: false });

export default function ImmunePage() {
  return <ImmuneClient />;
}
