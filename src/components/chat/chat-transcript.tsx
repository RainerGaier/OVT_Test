import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
          {m.role === "assistant" ? (
            // Claude's replies are markdown. Render them (GFM: tables,
            // strikethrough, task lists); no raw HTML is allowed, so this is
            // XSS-safe. User messages stay verbatim so their literal text
            // (e.g. a leading "#") is shown as typed.
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {m.content}
              </ReactMarkdown>
            </div>
          ) : (
            m.content
          )}
        </div>
      ))}
    </div>
  );
}
