import GroupChatClient from "./group-chat-client";

export default function GroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  return <GroupChatClient groupIdPromise={params} />;
}
