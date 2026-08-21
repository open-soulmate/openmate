"use client";
import dynamic from "next/dynamic";

const DownloadClient = dynamic(() => import("./download-client").then((m) => m.DownloadClient), { ssr: false });

export default function DownloadPage() {
  return <DownloadClient />;
}
