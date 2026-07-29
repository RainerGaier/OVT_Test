import { afterEach, expect, test } from "vitest";
import {
  generateTitle,
  setAnthropicClient,
  streamChat,
  type ChatMessage,
} from "@/lib/anthropic";

afterEach(() => setAnthropicClient(null));

function fakeStreamClient(deltas: string[]) {
  return {
    messages: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stream(_body: unknown) {
        return (async function* () {
          for (const text of deltas) {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text },
            };
          }
          // a non-text event is ignored by streamChat
          yield { type: "message_stop" };
        })();
      },
      create() {
        throw new Error("not used");
      },
    },
  };
}

test("streamChat yields the assistant text deltas", async () => {
  setAnthropicClient(fakeStreamClient(["Hel", "lo"]) as never);
  const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
  const chunks: string[] = [];
  for await (const c of streamChat(messages)) chunks.push(c);
  expect(chunks.join("")).toBe("Hello");
});

test("generateTitle returns the model's title text", async () => {
  setAnthropicClient({
    messages: {
      stream() {
        throw new Error("not used");
      },
      async create() {
        return { content: [{ type: "text", text: "Centering a Div" }] };
      },
    },
  } as never);
  const title = await generateTitle("How do I center a div?", "Use flexbox.");
  expect(title).toBe("Centering a Div");
});

test("generateTitle falls back to the truncated first message on failure", async () => {
  setAnthropicClient({
    messages: {
      stream() {
        throw new Error("not used");
      },
      async create() {
        throw new Error("boom");
      },
    },
  } as never);
  const long = "x".repeat(80);
  const title = await generateTitle(long, "whatever");
  expect(title).toBe("x".repeat(50));
});

test("uses the hermetic mock when ANTHROPIC_MOCK is set", async () => {
  setAnthropicClient(null);
  process.env.ANTHROPIC_MOCK = "1";
  try {
    const chunks: string[] = [];
    for await (const c of streamChat([{ role: "user", content: "hi" }])) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("This is a mocked streamed reply.");
    expect(await generateTitle("q", "a")).toBe("Mock Title");
  } finally {
    delete process.env.ANTHROPIC_MOCK;
    setAnthropicClient(null);
  }
});
