"use client";
import dynamic from "next/dynamic";
const BenchmarkClient = dynamic(() => import("./benchmark-client").then((m) => m.BenchmarkClient), { ssr: false });
export default function BenchmarkPage() {
  return <BenchmarkClient />;
}
