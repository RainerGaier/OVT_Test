"use client";

import { useState } from "react";
import {
  ConversationSidebar,
  type SidebarConversation,
} from "@/components/chat/conversation-sidebar";
import { ChatTranscript, type UiMessage } from "@/components/chat/chat-transcript";
import { MessageComposer } from "@/components/chat/message-composer";

export function ChatClient({
  initialConversations,
}: {
  initialConversations: SidebarConversation[];
}) {
  const [conversations, setConversations] =
    useState<SidebarConversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  async function refreshConversations() {
    const res = await fetch("/api/conversations");
    if (res.ok) setConversations(await res.json());
  }

  async function selectConversation(id: string) {
    setActiveId(id);
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) {
      const data = (await res.json()) as { messages: UiMessage[] };
      setMessages(data.messages);
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (id === activeId) newChat();
    await refreshConversations();
  }

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: text }),
      });
      const newId = res.headers.get("X-Conversation-Id");
      if (newId) setActiveId(newId);

      if (!res.ok) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Please try again.",
          };
          return copy;
        });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
      await refreshConversations();
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        disabled={streaming}
      />
      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatTranscript messages={messages} />
        </div>
        <MessageComposer onSend={send} disabled={streaming} />
      </main>
    </div>
  );
}
