"use client";
import dynamic from "next/dynamic";
const LinkClient = dynamic(() => import("./link-client").then(m => m.LinkClient), { ssr: false });
export default function LinkPage() { return <LinkClient />; }
