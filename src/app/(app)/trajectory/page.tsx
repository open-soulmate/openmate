"use client";
import dynamic from "next/dynamic";

const EvolutionTimeline = dynamic(() => import("./evolution-timeline").then((m) => m.EvolutionTimeline), { ssr: false });

export default function TrajectoryPage() {
  return <EvolutionTimeline />;
}
