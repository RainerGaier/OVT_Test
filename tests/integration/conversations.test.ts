import { expect, test } from "vitest";
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  messagesForClaude,
  setConversationTitle,
} from "@/lib/conversations";
import { makeUser } from "../factories/user";
import { makeConversation } from "../factories/conversation";
import { testPrisma } from "../helpers/db";

test("createConversation makes a placeholder-titled conversation for the user", async () => {
  const user = await makeUser();
  const convo = await createConversation(user.id);
  expect(convo.userId).toBe(user.id);
  expect(convo.title).toBe("New conversation");
});

test("listConversations returns only the caller's, newest first", async () => {
  const a = await makeUser({ email: "a@example.com" });
  const b = await makeUser({ email: "b@example.com" });
  const first = await makeConversation(a.id, { title: "first" });
  const second = await makeConversation(a.id, { title: "second" });
  await makeConversation(b.id, { title: "other user" });

  const list = await listConversations(a.id);
  expect(list.map((c) => c.title)).toEqual(["second", "first"]);
  expect(list.map((c) => c.id)).toEqual([second.id, first.id]);
});

test("getConversation returns messages for the owner, null for others", async () => {
  const owner = await makeUser({ email: "owner@example.com" });
  const other = await makeUser({ email: "other@example.com" });
  const convo = await makeConversation(owner.id);
  await addMessage(convo.id, "user", "hello");
  await addMessage(convo.id, "assistant", "hi there");

  const loaded = await getConversation(owner.id, convo.id);
  expect(loaded?.messages.map((m) => m.content)).toEqual(["hello", "hi there"]);
  expect(await getConversation(other.id, convo.id)).toBeNull();
});

test("messagesForClaude returns role/content oldest-first", async () => {
  const user = await makeUser();
  const convo = await makeConversation(user.id);
  await addMessage(convo.id, "user", "one");
  await addMessage(convo.id, "assistant", "two");
  const msgs = await messagesForClaude(convo.id);
  expect(msgs).toEqual([
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
  ]);
});

test("deleteConversation removes it (and cascades) for the owner only", async () => {
  const owner = await makeUser({ email: "o@example.com" });
  const other = await makeUser({ email: "x@example.com" });
  const convo = await makeConversation(owner.id);
  await addMessage(convo.id, "user", "hello");

  expect(await deleteConversation(other.id, convo.id)).toBe(false);
  expect(await deleteConversation(owner.id, convo.id)).toBe(true);
  expect(await getConversation(owner.id, convo.id)).toBeNull();
  expect(await testPrisma.message.count({ where: { conversationId: convo.id } })).toBe(0);
});

test("setConversationTitle updates the title", async () => {
  const user = await makeUser();
  const convo = await makeConversation(user.id);
  await setConversationTitle(convo.id, "A New Title");
  const reloaded = await getConversation(user.id, convo.id);
  expect(reloaded?.title).toBe("A New Title");
});
