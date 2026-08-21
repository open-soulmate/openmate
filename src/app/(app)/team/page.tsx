"use client";
import dynamic from "next/dynamic";

const TeamClient = dynamic(() => import("./team-client").then((m) => m.TeamClient), { ssr: false });

export default function TeamPage() {
  return <TeamClient />;
}
