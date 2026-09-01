"use client";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const ChatClient = dynamic(() => import("./chat-client").then((m) => m.ChatClient), { ssr: false });

export default function ChatPage() {
  // ?new=timestamp forces re-mount when clicking SoulMate "+" button
  const searchParams = useSearchParams();
  const key = searchParams.get("new") || "default";
  return <ChatClient key={key} />;
}
