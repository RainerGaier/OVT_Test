import Anthropic from "@anthropic-ai/sdk";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const TITLE_MODEL = "claude-haiku-4-5";
const SYSTEM_PROMPT =
  "You are a helpful assistant. Answer clearly and concisely.";

// The subset of the Anthropic SDK this module uses. Tests substitute a fake
// via setAnthropicClient so no request ever reaches the network.
export interface AnthropicLike {
  messages: {
    stream(body: unknown): AsyncIterable<{
      type: string;
      delta?: { type: string; text?: string };
    }>;
    create(body: unknown): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

let client: AnthropicLike | null = null;

function makeMockClient(): AnthropicLike {
  return {
    messages: {
      stream() {
        const text = "This is a mocked streamed reply.";
        return (async function* () {
          for (const ch of text) {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: ch },
            };
          }
        })();
      },
      async create() {
        return { content: [{ type: "text", text: "Mock Title" }] };
      },
    },
  };
}

function getClient(): AnthropicLike {
  if (client) return client;
  if (process.env.ANTHROPIC_MOCK) {
    client = makeMockClient();
    return client;
  }
  /* v8 ignore next 2 -- real SDK construction needs a live key; covered by prod, not tests */
  client = new Anthropic() as unknown as AnthropicLike;
  return client;
}

/** Test seam: inject a fake client, or pass null to reset to the real one. */
export function setAnthropicClient(c: AnthropicLike | null): void {
  client = c;
}

export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const stream = getClient().messages.stream({
    model: CHAT_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    // Stream text immediately — Sonnet 5 runs adaptive thinking when omitted.
    thinking: { type: "disabled" },
    messages,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}

export async function generateTitle(
  firstUser: string,
  firstAssistant: string,
): Promise<string> {
  const fallback = firstUser.slice(0, 50);
  try {
    const res = await getClient().messages.create({
      model: TITLE_MODEL,
      max_tokens: 20,
      system:
        "Generate a 3-5 word title summarizing the conversation. " +
        "Reply with ONLY the title text, no quotes or punctuation.",
      messages: [
        {
          role: "user",
          content: `User: ${firstUser}\nAssistant: ${firstAssistant}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text")?.text?.trim();
    return text && text.length > 0 ? text : fallback;
  } catch {
    return fallback;
  }
}
