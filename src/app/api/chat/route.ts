import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { streamChat } from "@/lib/anthropic";
import { ChatError, finishChatTurn, prepareChatTurn } from "@/lib/chat";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let prepared;
  try {
    const { conversationId, message } = (body ?? {}) as Record<string, unknown>;
    prepared = await prepareChatTurn(userId, { conversationId, message });
  } catch (err) {
    if (err instanceof ChatError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const { conversationId, isNew, claudeMessages, firstUserMessage } = prepared;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      try {
        for await (const delta of streamChat(claudeMessages)) {
          assistantText += delta;
          controller.enqueue(encoder.encode(delta));
        }
        await finishChatTurn(conversationId, isNew, firstUserMessage, assistantText);
        controller.close();
      } catch (err) {
        console.error("chat stream failed:", err);
        // Anthropic failed mid-stream: mark the stream errored and keep the
        // user message; the partial assistant reply is discarded.
        controller.enqueue(encoder.encode("\n\n[error] Claude is unavailable. Please retry."));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
    },
  });
}

// Surface pre-stream Anthropic errors (auth/rate/overload) as typed statuses.
export function mapAnthropicError(err: unknown): number {
  if (err instanceof Anthropic.RateLimitError) return 429;
  if (err instanceof Anthropic.APIError && err.status === 529) return 529;
  return 502;
}
