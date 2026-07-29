export type UiMessage = { role: "user" | "assistant"; content: string };

export function ChatTranscript({ messages }: { messages: UiMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Start the conversation by sending a message.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m, i) => (
        <div
          key={i}
          data-testid="chat-message"
          className={
            m.role === "user"
              ? "self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground"
              : "self-start rounded-lg bg-muted px-3 py-2"
          }
        >
          {m.content}
        </div>
      ))}
    </div>
  );
}
