# Chat Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-powered chat capability — multiple conversations per user, streamed replies, Haiku-generated titles — on top of the deployed Foundation + Auth base.

**Architecture:** Thin App Router route handlers delegate to injectable `src/lib/` modules (`lib/anthropic.ts` wraps `@anthropic-ai/sdk`; `lib/conversations.ts` + `lib/chat.ts` own the DB logic). `POST /api/chat` persists the user message, streams Claude's reply as a raw `ReadableStream`, then persists the assistant message and (on a new conversation) generates a title. The existing `Conversation`/`Message` tables are reused — **no migrations**. A client `ChatClient` component orchestrates the sidebar, transcript, and streaming composer.

**Tech Stack:** Next.js 16 (App Router, React 19, TS), `@anthropic-ai/sdk` (streaming), Prisma + Postgres, Auth.js v5, Zod, Vitest + RTL, Playwright, shadcn/ui.

**Design spec:** [`docs/superpowers/specs/2026-07-29-chat-slice-design.md`](../specs/2026-07-29-chat-slice-design.md).

## Global Constraints

Every task's requirements implicitly include this section.

- **Framework:** Next.js 16 App Router, React 19, TypeScript. Thin route handlers delegate to `src/lib/` modules.
- **Prisma pinned to `^6.19.3`** — do NOT let any tooling bump it to 7.
- **No schema migrations** — reuse the existing `Conversation` (`id`, `userId` cascade, `title`, `createdAt`) and `Message` (`id`, `conversationId` cascade, `role` `"user"|"assistant"`, `content` `@db.Text`, `createdAt`) tables.
- **Models:** chat model `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"`; title model `claude-haiku-4-5`. Use these exact ID strings — never append date suffixes.
- **Chat streaming:** set `thinking: { type: "disabled" }` on the chat call so text streams immediately (Sonnet 5 runs adaptive thinking when `thinking` is omitted, which delays first token).
- **Injectable client:** `lib/anthropic.ts` exposes `setAnthropicClient()` so unit/integration tests substitute a fake and **spend no API credits**. E2E uses the `ANTHROPIC_MOCK=1` env seam.
- **Error handling:** every route validates input with Zod and returns typed JSON errors: **400** invalid input · **401** unauthenticated · **403** another user's conversation · **404** unknown conversation · **502** when Claude fails · **429**/**529** mapped to a retryable message.
- **Secrets:** `ANTHROPIC_API_KEY` lives in `.env.local` and Vercel, never in the tracked `.env`.
- **Coverage:** `src/app/**` is excluded from coverage (e2e-tested); `src/lib/**` carries the 90% bar; 80% global. Keep chat logic in `src/lib` so it's covered.
- **Env vars:** `ANTHROPIC_API_KEY` (required), `ANTHROPIC_MODEL` (optional, defaults `claude-sonnet-5`).

---

## Task 1: Anthropic client library (`lib/anthropic.ts`)

**Files:**
- Create: `src/lib/anthropic.ts`
- Modify: `vitest.config.ts` (inline `@anthropic-ai/sdk` for ESM), `.env.example`, `.env.local`
- Test: `tests/unit/anthropic.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`.
- Produces:
  - `streamChat(messages: ChatMessage[]): AsyncGenerator<string>` — yields assistant text deltas.
  - `generateTitle(firstUser: string, firstAssistant: string): Promise<string>` — 3–5 word title via Haiku, falls back to truncated `firstUser` on error/empty.
  - `setAnthropicClient(client: AnthropicLike | null): void` — test seam.
  - `type ChatMessage = { role: "user" | "assistant"; content: string }`.

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add env vars**

Append to `.env.example`:

```bash

# Anthropic (chat slice)
ANTHROPIC_API_KEY="replace-me"
# Optional — chat model; defaults to claude-sonnet-5
# ANTHROPIC_MODEL="claude-sonnet-5"
```

Append to `.env.local` (gitignored — use your real key from console.anthropic.com):

```bash
ANTHROPIC_API_KEY="sk-ant-your-real-key"
```

- [ ] **Step 3: Inline the SDK for Vitest**

In `vitest.config.ts`, extend the existing `server.deps.inline` array so it reads:

```typescript
      deps: {
        inline: [/next-auth/, /@auth\//, /@anthropic-ai\//],
      },
```

> `@anthropic-ai/sdk` ships ESM; inlining routes it through Vite's resolver like `next-auth`, avoiding `ERR_MODULE_NOT_FOUND` under Vitest.

- [ ] **Step 4: Write the failing unit test**

Create `tests/unit/anthropic.test.ts`:

```typescript
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
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `@/lib/anthropic` does not exist.

- [ ] **Step 6: Implement `src/lib/anthropic.ts`**

```typescript
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

function getClient(): AnthropicLike {
  if (!client) client = new Anthropic() as unknown as AnthropicLike;
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/anthropic.ts tests/unit/anthropic.test.ts vitest.config.ts .env.example package.json package-lock.json
git commit -m "feat: add injectable Anthropic client with streamChat and generateTitle"
```

---

## Task 2: Conversation data helpers + `makeConversation` factory

**Files:**
- Create: `src/lib/conversations.ts`, `tests/factories/conversation.ts`
- Test: `tests/integration/conversations.test.ts`

**Interfaces:**
- Consumes: `src/lib/db.ts` (`prisma`), `tests/factories/user.ts` (`makeUser`).
- Produces (`src/lib/conversations.ts`):
  - `createConversation(userId: string): Promise<Conversation>` — title `"New conversation"`.
  - `listConversations(userId: string): Promise<{ id: string; title: string; createdAt: Date }[]>` — newest first.
  - `getConversation(userId, id): Promise<(Conversation & { messages: Message[] }) | null>` — null if not owned/missing.
  - `deleteConversation(userId, id): Promise<boolean>` — false if not owned/missing.
  - `addMessage(conversationId, role, content): Promise<Message>`.
  - `messagesForClaude(conversationId): Promise<{ role: "user" | "assistant"; content: string }[]>` — ordered oldest first.
  - `setConversationTitle(id, title): Promise<void>`.
- Produces (`tests/factories/conversation.ts`): `makeConversation(userId, overrides?): Promise<Conversation>`.

- [ ] **Step 1: Create the factory**

Create `tests/factories/conversation.ts`:

```typescript
import type { Conversation } from "@prisma/client";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeConversation(
  userId: string,
  overrides: Partial<{ title: string }> = {},
): Promise<Conversation> {
  counter += 1;
  return testPrisma.conversation.create({
    data: {
      userId,
      title: overrides.title ?? `Conversation ${counter}`,
    },
  });
}
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/conversations.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL — `@/lib/conversations` does not exist.

- [ ] **Step 4: Implement `src/lib/conversations.ts`**

```typescript
import type { Conversation, Message } from "@prisma/client";
import { prisma } from "@/lib/db";

export function createConversation(userId: string): Promise<Conversation> {
  return prisma.conversation.create({
    data: { userId, title: "New conversation" },
  });
}

export function listConversations(
  userId: string,
): Promise<{ id: string; title: string; createdAt: Date }[]> {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<(Conversation & { messages: Message[] }) | null> {
  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!convo || convo.userId !== userId) return null;
  return convo;
}

export async function deleteConversation(
  userId: string,
  id: string,
): Promise<boolean> {
  const convo = await prisma.conversation.findUnique({ where: { id } });
  if (!convo || convo.userId !== userId) return false;
  await prisma.conversation.delete({ where: { id } });
  return true;
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Message> {
  return prisma.message.create({
    data: { conversationId, role, content },
  });
}

export async function messagesForClaude(
  conversationId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

export async function setConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await prisma.conversation.update({ where: { id }, data: { title } });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/conversations.ts tests/factories/conversation.ts tests/integration/conversations.test.ts
git commit -m "feat: add conversation data helpers and makeConversation factory"
```

---

## Task 3: Chat turn orchestration (`lib/chat.ts`)

**Files:**
- Create: `src/lib/chat.ts`
- Test: `tests/integration/chat.test.ts`

**Interfaces:**
- Consumes: `src/lib/conversations.ts`, `src/lib/anthropic.ts` (`generateTitle`), `zod`.
- Produces:
  - `class ChatError extends Error { status: 400 | 403 | 404 }`.
  - `prepareChatTurn(userId, input: { conversationId?: unknown; message: unknown }): Promise<{ conversationId: string; isNew: boolean; claudeMessages: ChatMessage[]; firstUserMessage: string }>` — validates with Zod (throws `ChatError(400)`), resolves ownership (`ChatError(403)`/`(404)`) or creates a new conversation, persists the user message, and returns the message array to send to Claude.
  - `finishChatTurn(conversationId, isNew, firstUserMessage, assistantText): Promise<void>` — persists the assistant message; if `isNew`, generates and saves the title.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/chat.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL — `@/lib/chat` does not exist.

- [ ] **Step 3: Implement `src/lib/chat.ts`**

```typescript
import { z } from "zod";
import { generateTitle, type ChatMessage } from "@/lib/anthropic";
import {
  addMessage,
  createConversation,
  messagesForClaude,
  setConversationTitle,
} from "@/lib/conversations";
import { prisma } from "@/lib/db";

export class ChatError extends Error {
  status: 400 | 403 | 404;
  constructor(status: 400 | 403 | 404, message: string) {
    super(message);
    this.status = status;
    this.name = "ChatError";
  }
}

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
});

export async function prepareChatTurn(
  userId: string,
  input: { conversationId?: unknown; message: unknown },
): Promise<{
  conversationId: string;
  isNew: boolean;
  claudeMessages: ChatMessage[];
  firstUserMessage: string;
}> {
  const parsed = chatSchema.safeParse(input);
  if (!parsed.success) throw new ChatError(400, "Invalid input");
  const { conversationId, message } = parsed.data;

  let id: string;
  let isNew = false;
  if (conversationId) {
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!convo) throw new ChatError(404, "Conversation not found");
    if (convo.userId !== userId) throw new ChatError(403, "Forbidden");
    id = convo.id;
  } else {
    id = (await createConversation(userId)).id;
    isNew = true;
  }

  await addMessage(id, "user", message);
  const claudeMessages = await messagesForClaude(id);
  return { conversationId: id, isNew, claudeMessages, firstUserMessage: message };
}

export async function finishChatTurn(
  conversationId: string,
  isNew: boolean,
  firstUserMessage: string,
  assistantText: string,
): Promise<void> {
  await addMessage(conversationId, "assistant", assistantText);
  if (isNew) {
    const title = await generateTitle(firstUserMessage, assistantText);
    await setConversationTitle(conversationId, title);
  }
}
```

> Note: `getConversation` is imported directly from `@/lib/conversations` by the route handlers — `lib/chat.ts` does not re-export it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat.ts tests/integration/chat.test.ts
git commit -m "feat: add chat turn orchestration with validation, ownership, and titling"
```

---

## Task 4: Session user id, API route handlers, and the e2e mock seam

**Files:**
- Modify: `src/lib/auth.ts` (add `jwt`/`session` callbacks), `src/lib/anthropic.ts` (inline the mock seam)
- Create: `src/types/next-auth.d.ts`, `src/app/api/conversations/route.ts`, `src/app/api/conversations/[id]/route.ts`, `src/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `src/lib/auth.ts` (`auth`), `src/lib/conversations.ts`, `src/lib/chat.ts`, `src/lib/anthropic.ts`.
- Produces:
  - `session.user.id` populated on every authenticated session (needed by every route and the page).
  - The four HTTP endpoints from the spec. `src/app/**` is excluded from unit coverage — these are verified by the Task 6 e2e test and the build.

- [ ] **Step 1: Expose the user id on the session**

The foundation's `auth.ts` has no `jwt`/`session` callbacks, so `session.user.id` is `undefined`. Add callbacks that carry the id from the authorized user → JWT → session. In `src/lib/auth.ts`, replace the `NextAuth({...})` call's options with a version that merges `authConfig.callbacks` and adds `jwt`/`session`:

```typescript
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) =>
        authorizeCredentials({ email: creds?.email, password: creds?.password }),
    }),
    // GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET }),
  ],
});
```

> Spreading `...authConfig.callbacks` preserves the `authorized` callback; a bare `callbacks: {...}` would drop it.

- [ ] **Step 2: Add the type augmentation**

Create `src/types/next-auth.d.ts` so `session.user.id` and `token.id` are typed (without this, `npx tsc --noEmit` errors on `session.user.id`):

```typescript
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}

export {};
```

- [ ] **Step 3: Add the e2e mock seam to `lib/anthropic.ts`**

Update `getClient()` in `src/lib/anthropic.ts` to return a hermetic mock when `ANTHROPIC_MOCK` is set (defined inline to avoid a runtime path-alias `require` and a circular import):

```typescript
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
```

> The `setAnthropicClient` test seam still wins (checked first via the `if (client)` guard once set), so unit tests are unaffected. The `v8 ignore` keeps the untestable real-client line from dropping `lib/` below 90%.

- [ ] **Step 3b: Add a unit test that exercises the mock branch**

Append to `tests/unit/anthropic.test.ts` so `makeMockClient` is covered (keeps `lib/anthropic.ts` ≥ 90%):

```typescript
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
```

Run: `npm run test:unit` — Expected: PASS.

- [ ] **Step 4: Create `GET /api/conversations`**

Create `src/app/api/conversations/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/conversations";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(await listConversations(userId));
}
```

> `session.user.id` is provided by the `jwt`/`session` callbacks added in Step 1.

- [ ] **Step 5: Create `GET`/`DELETE /api/conversations/[id]`**

Create `src/app/api/conversations/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteConversation, getConversation } from "@/lib/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const convo = await getConversation(userId, id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: convo.id,
    title: convo.title,
    messages: convo.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteConversation(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
```

> Next.js 16 route-handler `params` is a Promise — `await params` before use.

- [ ] **Step 6: Create the streaming `POST /api/chat`**

Create `src/app/api/chat/route.ts`:

```typescript
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
        // Anthropic failed mid-stream: mark the stream errored and keep the
        // user message; the partial assistant reply is discarded.
        controller.enqueue(encoder.encode("\n\n[error] Claude is unavailable. Please retry."));
        controller.close();
        void err;
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
```

> `mapAnthropicError` documents the spec's 429/529→retryable / 502 contract. In this raw-stream design the Anthropic call opens inside the stream, so mid-stream failures are handled by the error branch above; the helper is exported for reuse if a pre-flight check is added later.

- [ ] **Step 7: Confirm it type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: clean compile (the `next-auth.d.ts` augmentation makes `session.user.id` type-check); `next build` succeeds and lists `/api/chat`, `/api/conversations`, `/api/conversations/[id]`.

- [ ] **Step 8: Re-run the existing suite to confirm the auth change is safe**

Run: `npm test`
Expected: PASS — the auth-callback change doesn't regress the existing unit/component/integration tests (23 prior tests plus the ones added in Tasks 1–3).

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth.ts src/lib/anthropic.ts src/types/next-auth.d.ts src/app/api
git commit -m "feat: expose session user id and add chat/conversation API routes"
```

---

## Task 5: Chat UI components

**Files:**
- Create: `src/components/chat/chat-transcript.tsx`, `src/components/chat/message-composer.tsx`, `src/components/chat/conversation-sidebar.tsx`, `src/components/chat/chat-client.tsx`
- Modify: add shadcn `textarea`
- Test: `tests/component/chat-transcript.test.tsx`, `tests/component/message-composer.test.tsx`, `tests/component/conversation-sidebar.test.tsx`

**Interfaces:**
- Consumes: shadcn `Button`, `Textarea`.
- Produces: presentational components plus the `ChatClient` orchestrator. `ChatClient`'s streaming loop is verified by the Task 6 e2e; the three presentational components are unit-tested here.

- [ ] **Step 1: Add the shadcn Textarea**

```bash
npx shadcn@latest add textarea
```

- [ ] **Step 2: Write the failing transcript test**

Create `tests/component/chat-transcript.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ChatTranscript } from "@/components/chat/chat-transcript";

test("renders user and assistant messages in order", () => {
  render(
    <ChatTranscript
      messages={[
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ]}
    />,
  );
  const items = screen.getAllByTestId("chat-message");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("hello");
  expect(items[1]).toHaveTextContent("hi there");
});

test("shows an empty-state hint when there are no messages", () => {
  render(<ChatTranscript messages={[]} />);
  expect(screen.getByText(/start the conversation/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement the transcript**

Create `src/components/chat/chat-transcript.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the transcript test**

Run: `npm run test:component`
Expected: PASS.

- [ ] **Step 5: Write the failing composer test**

Create `tests/component/message-composer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MessageComposer } from "@/components/chat/message-composer";

test("submits the typed message and clears the field", async () => {
  const onSend = vi.fn();
  const user = userEvent.setup();
  render(<MessageComposer onSend={onSend} disabled={false} />);
  const box = screen.getByRole("textbox");
  await user.type(box, "hello");
  await user.click(screen.getByRole("button", { name: /send/i }));
  expect(onSend).toHaveBeenCalledWith("hello");
  expect(box).toHaveValue("");
});

test("does not send while disabled", async () => {
  const onSend = vi.fn();
  render(<MessageComposer onSend={onSend} disabled={true} />);
  expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
});
```

- [ ] **Step 6: Implement the composer**

Create `src/components/chat/message-composer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message…"
        rows={2}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled}>
        Send
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Write the failing sidebar test**

Create `tests/component/conversation-sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";

const convos = [
  { id: "1", title: "First chat" },
  { id: "2", title: "Second chat" },
];

test("lists conversations and fires onSelect", async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(
    <ConversationSidebar
      conversations={convos}
      activeId="1"
      onSelect={onSelect}
      onNew={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await user.click(screen.getByText("Second chat"));
  expect(onSelect).toHaveBeenCalledWith("2");
});

test("fires onNew and onDelete", async () => {
  const onNew = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <ConversationSidebar
      conversations={convos}
      activeId="1"
      onSelect={vi.fn()}
      onNew={onNew}
      onDelete={onDelete}
    />,
  );
  await user.click(screen.getByRole("button", { name: /new chat/i }));
  expect(onNew).toHaveBeenCalled();
  await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  expect(onDelete).toHaveBeenCalledWith("1");
});
```

- [ ] **Step 8: Implement the sidebar**

Create `src/components/chat/conversation-sidebar.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export type SidebarConversation = { id: string; title: string };

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: SidebarConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex w-64 flex-col gap-2 border-r p-3">
      <Button onClick={onNew}>+ New chat</Button>
      <ul className="flex flex-col gap-1">
        {conversations.map((c) => (
          <li key={c.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                c.id === activeId ? "bg-muted font-medium" : "hover:bg-muted"
              }`}
            >
              {c.title}
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => onDelete(c.id)}
              className="text-muted-foreground px-1 text-sm hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 9: Run the component tests**

Run: `npm run test:component`
Expected: PASS (all chat component tests green).

- [ ] **Step 10: Implement the `ChatClient` orchestrator**

Create `src/components/chat/chat-client.tsx`:

```tsx
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
    <div className="flex min-h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
      />
      <main className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex-1 overflow-y-auto">
          <ChatTranscript messages={messages} />
        </div>
        <MessageComposer onSend={send} disabled={streaming} />
      </main>
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/components/chat tests/component components.json
git commit -m "feat: add chat UI components (sidebar, transcript, composer, client)"
```

---

## Task 6: Chat page + end-to-end smoke test

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `playwright.config.ts` (set `ANTHROPIC_MOCK` + dummy key in the webServer env)
- Test: `tests/e2e/chat-smoke.spec.ts`

**Interfaces:**
- Consumes: `src/lib/auth.ts` (`auth`), `src/lib/conversations.ts` (`listConversations`), `src/components/chat/chat-client.tsx`.
- Produces: the protected `/chat` page and an e2e spec proving sign in → send → streamed reply → titled conversation in the sidebar, with Anthropic mocked via `ANTHROPIC_MOCK`.

- [ ] **Step 1: Replace the placeholder `/chat` page**

Replace `src/app/chat/page.tsx`:

```tsx
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
```

> The proxy already redirects unauthenticated visitors from `/chat` to `/signin`, so `userId` is present in practice; the guard keeps types honest.

- [ ] **Step 2: Set the mock env in Playwright's webServer**

In `playwright.config.ts`, add `ANTHROPIC_MOCK` and a dummy key to `webServer.env`:

```typescript
    env: {
      DATABASE_URL: TEST_DB,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret",
      AUTH_URL: BASE_URL,
      ANTHROPIC_MOCK: "1",
      ANTHROPIC_API_KEY: "e2e-not-used",
    },
```

> `ANTHROPIC_MOCK=1` makes `lib/anthropic` use the hermetic mock, so the e2e boots the real app end-to-end without any API key or network call.

- [ ] **Step 3: Write the e2e smoke spec**

Create `tests/e2e/chat-smoke.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("sign up, sign in, and hold a streamed chat", async ({ page }) => {
  const email = `e2e-chat-${Date.now()}@example.com`;
  const password = "password-123";

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL(/\/signin/);

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/chat");
  await page.getByRole("textbox").fill("Hello Claude");
  await page.getByRole("button", { name: /send/i }).click();

  // The mocked stream replies with this exact text.
  await expect(
    page.getByText("This is a mocked streamed reply."),
  ).toBeVisible();

  // The new conversation appears in the sidebar with its generated title.
  await expect(page.getByText("Mock Title")).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — the new chat spec and the existing auth specs are green.

- [ ] **Step 5: Commit**

```bash
git add src/app/chat/page.tsx playwright.config.ts tests/e2e/chat-smoke.spec.ts
git commit -m "test: wire chat page and add hermetic e2e chat smoke test"
```

---

## Task 7: Coverage, env docs, and deployment wiring

**Files:**
- Modify: `README.md` (env + chat notes), `docs/deploy.md` (Anthropic env var)

**Interfaces:**
- Consumes: everything above.
- Produces: passing coverage thresholds, documented env vars, and Vercel deploy notes for `ANTHROPIC_API_KEY`.

- [ ] **Step 1: Run the full coverage suite**

Run: `npm run test:coverage`
Expected: all tests pass; `src/lib` stays ≥90% (the new `lib/anthropic.ts`, `lib/conversations.ts`, `lib/chat.ts` are exercised by the unit + integration tests) and global ≥80%. If `lib/anthropic.ts` is below 90%, add a unit test for the uncovered branch (e.g. `streamChat` ignoring a non-text event) rather than lowering the threshold.

- [ ] **Step 2: Document the env vars in the README**

Under the local-development steps in `README.md`, add a note after the `.env.local` step:

```markdown
> The chat feature needs `ANTHROPIC_API_KEY` in `.env.local` (get one at console.anthropic.com). Optionally set `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`).
```

- [ ] **Step 3: Add the Anthropic var to the deploy runbook**

In `docs/deploy.md`, add a row to the Vercel env-var table (Production + Preview):

```markdown
| `ANTHROPIC_API_KEY` | Claude API key for the chat feature | from console.anthropic.com |
```

And note: do **not** set `ANTHROPIC_MOCK` on Vercel — it's a local/CI e2e seam only.

- [ ] **Step 4: Final verification**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm run test:coverage`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/deploy.md
git commit -m "docs: document ANTHROPIC_API_KEY for local dev and Vercel"
```

- [ ] **Step 6: Deploy checklist (manual, in Vercel)**

- [ ] Add `ANTHROPIC_API_KEY` to Vercel (Production + Preview).
- [ ] Push the branch; confirm CI is green.
- [ ] After deploy, sign in on the live URL, open `/chat`, and confirm a real streamed reply and a generated title.

---

## Self-Review Notes

Spec coverage:

- **Multiple conversations + sidebar:** Task 2 (`listConversations`), Task 5 (`ConversationSidebar`, `ChatClient`).
- **Streamed replies (raw ReadableStream + `@anthropic-ai/sdk`):** Task 1 (`streamChat`), Task 4 (`POST /api/chat`), Task 5 (`ChatClient` reader loop).
- **Claude-generated titles (Haiku) with fallback:** Task 1 (`generateTitle`), Task 3 (`finishChatTurn`).
- **Delete (no rename):** Task 2 (`deleteConversation`), Task 4 (`DELETE` route), Task 5 (sidebar delete).
- **Ownership + error contract (400/401/403/404/502, 429/529 retryable):** Task 3 (`ChatError`), Task 4 (routes + `mapAnthropicError`).
- **Injectable client / no credits in tests:** Task 1 (`setAnthropicClient`), Task 6 (`ANTHROPIC_MOCK`).
- **No migrations:** reuses existing tables throughout.
- **Four-layer tests:** unit (Task 1), integration (Tasks 2–3), component (Task 5), e2e (Task 6).
- **Env/config:** Task 1 (`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`), Task 7 (docs + Vercel).

Deferred (out of scope, per spec): rename-conversation; the app-wide theme pass.
