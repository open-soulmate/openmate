"use client";
import dynamic from "next/dynamic";

const MindClient = dynamic(() => import("./mind-client").then((m) => m.MindClient), { ssr: false });

export default function MindPage() {
  return <MindClient />;
}
