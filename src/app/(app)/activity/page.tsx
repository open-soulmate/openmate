"use client";
import dynamic from "next/dynamic";

const ActivityClient = dynamic(() => import("./activity-client").then((m) => m.ActivityClient), { ssr: false });

export default function ActivityPage() {
  return <ActivityClient />;
}
