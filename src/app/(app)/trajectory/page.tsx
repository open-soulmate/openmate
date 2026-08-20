"use client";
import dynamic from "next/dynamic";
const TrajectoryClient = dynamic(() => import("./trajectory-client").then((m) => m.TrajectoryClient), { ssr: false });
export default function TrajectoryPage() {
  return <TrajectoryClient />;
}
