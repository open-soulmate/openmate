"use client";
import dynamic from "next/dynamic";
const WillClient = dynamic(() => import("./will-client").then((m) => m.WillClient), { ssr: false });
export default function WillPage() {
  return <WillClient />;
}
