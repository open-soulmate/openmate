"use client";
import dynamic from "next/dynamic";

const NotificationsClient = dynamic(() => import("./notifications-client").then((m) => m.NotificationsClient), { ssr: false });

export default function NotificationsPage() {
  return <NotificationsClient />;
}
