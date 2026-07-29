import { afterEach, expect, test } from "vitest";
import { ChatError, finishChatTurn, prepareChatTurn } from "@/lib/chat";
import { setAnthropicClient } from "@/lib/anthropic";
import { getConversation } from "@/lib/conversations";
import { makeUser } from "../factories/user";
import { makeConversation } from "../factories/conversation";

afterEach(() => setAnthropicClient(null));

test("prepareChatTurn creates a conversation and saves the user message when none given", async () => {
  const user = await makeUser();
  const result = await prepareChatTurn(user.id, { message: "hello there" });
  expect(result.isNew).toBe(true);
  expect(result.firstUserMessage).toBe("hello there");
  expect(result.claudeMessages).toEqual([
    { role: "user", content: "hello there" },
  ]);
  const convo = await getConversation(user.id, result.conversationId);
  expect(convo?.messages.map((m) => m.content)).toEqual(["hello there"]);
});

test("prepareChatTurn appends to an existing owned conversation", async () => {
  const user = await makeUser();
  const convo = await makeConversation(user.id);
  await prepareChatTurn(user.id, {
    conversationId: convo.id,
    message: "first",
  });
  const second = await prepareChatTurn(user.id, {
    conversationId: convo.id,
    message: "second",
  });
  expect(second.isNew).toBe(false);
  expect(second.claudeMessages).toEqual([
    { role: "user", content: "first" },
    { role: "user", content: "second" },
  ]);
});

test("prepareChatTurn rejects another user's conversation with 403", async () => {
  const owner = await makeUser({ email: "owner@example.com" });
  const other = await makeUser({ email: "other@example.com" });
  const convo = await makeConversation(owner.id);
  await expect(
    prepareChatTurn(other.id, { conversationId: convo.id, message: "hi" }),
  ).rejects.toMatchObject({ status: 403 });
});

test("prepareChatTurn returns 404 for an unknown conversation", async () => {
  const user = await makeUser();
  await expect(
    prepareChatTurn(user.id, { conversationId: "nope", message: "hi" }),
  ).rejects.toMatchObject({ status: 404 });
});

test("prepareChatTurn rejects invalid input with 400", async () => {
  const user = await makeUser();
  await expect(
    prepareChatTurn(user.id, { message: "" }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(prepareChatTurn(user.id, { message: 123 })).rejects.toBeInstanceOf(
    ChatError,
  );
});

test("finishChatTurn saves the assistant message and titles a new conversation", async () => {
  setAnthropicClient({
    messages: {
      stream() {
        throw new Error("not used");
      },
      async create() {
        return { content: [{ type: "text", text: "Greeting Chat" }] };
      },
    },
  } as never);
  const user = await makeUser();
  const prep = await prepareChatTurn(user.id, { message: "hello there" });
  await finishChatTurn(prep.conversationId, true, prep.firstUserMessage, "Hi!");

  const convo = await getConversation(user.id, prep.conversationId);
  expect(convo?.title).toBe("Greeting Chat");
  expect(convo?.messages.map((m) => `${m.role}:${m.content}`)).toEqual([
    "user:hello there",
    "assistant:Hi!",
  ]);
});
