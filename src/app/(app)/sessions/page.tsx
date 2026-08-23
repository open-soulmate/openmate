"use client";
import dynamic from "next/dynamic";
const SessionsClient = dynamic(() => import("./sessions-client").then((m) => m.SessionsClient), { ssr: false });
export default function SessionsPage() {
  return <SessionsClient />;
}
