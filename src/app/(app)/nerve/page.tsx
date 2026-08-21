"use client";
import dynamic from "next/dynamic";

const NerveClient = dynamic(() => import("./nerve-client").then((m) => m.NerveClient), { ssr: false });

export default function NervePage() {
  return <NerveClient />;
}
