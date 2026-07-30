import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/conversations";
import { ChatClient } from "@/components/chat/chat-client";

export default async function ChatPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const conversations = userId ? await listConversations(userId) : [];
  return (
    <ChatClient
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
      }))}
    />
  );
}
