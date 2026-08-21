"use client";
import dynamic from "next/dynamic";

const LearnClient = dynamic(() => import("./learn-client").then((m) => m.LearnClient), { ssr: false });

export default function LearnPage() {
  return <LearnClient />;
}
