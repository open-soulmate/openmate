"use client";
import dynamic from "next/dynamic";

const ChatClient = dynamic(() => import("./chat-client").then((m) => m.ChatClient), { ssr: false });

export default function ChatPage() {
  return <ChatClient />;
}
