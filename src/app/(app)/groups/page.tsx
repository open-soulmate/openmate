"use client";
import dynamic from "next/dynamic";

const GroupsClient = dynamic(() => import("./groups-client").then((m) => m.GroupsClient), { ssr: false });

export default function GroupsPage() {
  return <GroupsClient />;
}
