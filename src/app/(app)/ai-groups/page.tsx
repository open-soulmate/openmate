"use client";
import dynamic from "next/dynamic";

const AIGroupsClient = dynamic(() => import("./ai-groups-client"), { ssr: false });

export default function AIGroupsPage() {
  return <AIGroupsClient />;
}
