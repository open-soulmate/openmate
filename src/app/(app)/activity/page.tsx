"use client";
import dynamic from "next/dynamic";

const ActivityFeedClient = dynamic(() => import("./activity-feed-client").then((m) => m.ActivityFeedClient), { ssr: false });

export default function ActivityPage() {
  return <ActivityFeedClient />;
}
