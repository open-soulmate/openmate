"use client";
import dynamic from "next/dynamic";

const KbSharingClient = dynamic(() => import("./kb-sharing-client").then((m) => m.KbSharingClient), { ssr: false });

export default function KbSharingPage() {
  return <KbSharingClient />;
}
