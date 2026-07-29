# Chat Slice Design

**Status:** Approved for planning (2026-07-29)

**Goal:** Add a Claude-powered chat capability on top of the deployed Foundation + Auth
base. A signed-in user holds multiple conversations with Claude, each streamed token by
token and persisted to Postgres, with conversations listed in a sidebar.

**Builds on:** the existing foundation — Next.js 16 App Router, Prisma + Postgres, Auth.js
credentials, the injectable-`lib/`-module pattern, and the four-layer test strategy. This
slice reuses the `Conversation` and `Message` tables already in the schema and adds **no
migrations**.

**Out of scope:** the app-wide visual theme (a separate follow-up pass that will restyle
these components along with the rest of the app). Rename-conversation is deliberately
omitted (delete is included).

---

## Decisions

- **Multiple conversations per user** — a sidebar lists past conversations; clicking one
  loads its history; a "New chat" button starts a fresh one.
- **Claude-generated titles** — a new conversation is created with a placeholder title;
  after the first user↔assistant exchange, a small separate call to **Haiku**
  (`claude-haiku-4-5`) produces a 3–5 word title. On failure, fall back to the truncated
  first user message.
- **Delete** conversations from the sidebar (cascade removes messages). **No rename.**
- **Streaming transport:** raw `ReadableStream` from the route handler using the official
  `@anthropic-ai/sdk` behind an injectable `lib/anthropic.ts`. No Vercel AI SDK — keeps
  the code transparent and consistent with the foundation's injectable-client pattern and
  the canned-SSE test approach.
- **Chat model:** `ANTHROPIC_MODEL`, default `claude-sonnet-5`.

> Exact current Claude model IDs and streaming SDK details are confirmed against the
> `claude-api` reference during implementation planning.

---

## Data model

No schema changes. Existing tables:

- `Conversation` — `id`, `userId` (cascade), `title`, `createdAt`, `@@index([userId, createdAt])`
- `Message` — `id`, `conversationId` (cascade), `role` (`"user" | "assistant"`), `content` (`@db.Text`), `createdAt`, `@@index([conversationId, createdAt])`

---

## API surface

Thin route handlers delegate to `lib/` modules. Every handler validates input with Zod and
returns typed JSON errors with accurate status codes.

| Route | Purpose |
|---|---|
| `GET /api/conversations` | List the signed-in user's conversations (`id`, `title`, `createdAt`), newest first — feeds the sidebar |
| `GET /api/conversations/[id]` | Load one conversation's messages, ownership-checked |
| `DELETE /api/conversations/[id]` | Delete a conversation, ownership-checked (cascades to messages) |
| `POST /api/chat` | Send a message and stream Claude's reply |

### `POST /api/chat`

Request body: `{ conversationId?: string, message: string }`.

1. `auth()` → resolve `userId` (**401** if unauthenticated).
2. Zod-validate the body (**400** if invalid).
3. Resolve the conversation:
   - `conversationId` present → verify it belongs to `userId` (**403** if another user's, **404** if missing).
   - absent → create a new `Conversation` for `userId` with a placeholder title; mark it *new*.
   - When a conversation is created, its id is returned to the client via an
     **`X-Conversation-Id`** response header (so the browser can target follow-ups and
     refresh the sidebar).
4. Persist the **user** `Message` (`role: "user"`) before calling Claude.
5. Load the conversation's prior messages and build the Claude input array.
6. Call `lib/anthropic.streamChat(...)` and pipe text deltas back as a `ReadableStream`,
   accumulating the full assistant text server-side.
7. When the stream completes: persist the **assistant** `Message` (`role: "assistant"`).
   If the conversation was *new*, generate the title (Haiku) and update `conversation.title`
   (fallback: truncated first user message). These writes happen within the stream's
   completion handler, inside the request lifecycle.

### Streaming flow (one send)

```
client POST /api/chat {conversationId?, message}
  → auth()            (401 if signed out)
  → Zod validate      (400 if invalid)
  → own conversation? (403 other user / 404 missing; else create new)
  → save user message
  → load prior messages → build Claude input
  → lib/anthropic.streamChat(...)  → ReadableStream of tokens ──► browser
  → on stream end: save assistant message
                   if new: generate + save title (Haiku)
```

---

## `lib/anthropic.ts` (injectable client)

Wraps `@anthropic-ai/sdk` behind an injectable client, mirroring `lib/db.ts`, so unit and
integration tests substitute a fake and spend no API credits.

- `streamChat({ messages, system, model }): AsyncIterable<string>` — yields text deltas.
- `generateTitle(firstUser, firstAssistant): Promise<string>` — 3–5 word title via Haiku.
- A default client is constructed from `ANTHROPIC_API_KEY`; the module accepts an injected
  client for tests.
- A simple, editable system-prompt constant lives here (or a small `constants` module).

---

## Error handling

- **400** invalid input (Zod) · **401** unauthenticated · **403** another user's
  conversation · **404** unknown conversation.
- **502** when Claude fails outright.
- **429** (rate limit) / **529** (overload) → mapped to a **retryable** message the UI
  shows ("Claude is busy — try again"), not a stack trace.
- Claude error **before** streaming starts → JSON error with the mapped status.
- Claude error **mid-stream** → end the stream with an error marker; the user message stays
  saved, the partial assistant reply is discarded, and the UI offers retry.

---

## UI

- **`/chat/page.tsx`** — protected server component (redirect handled by the existing
  proxy). Fetches the user's conversation list server-side for first paint, then renders the
  client shell.
- **Components** in `src/components/chat/`:
  - **`ChatClient`** — orchestrator (client): active-conversation + message state, POSTs to
    `/api/chat`, reads the token stream, appends to the transcript, refreshes the sidebar
    when a new conversation or title appears.
  - **`ConversationSidebar`** — lists conversations, "＋ New chat" button, per-item delete,
    highlights the active conversation.
  - **`ChatTranscript`** — user/assistant bubbles; the in-flight assistant bubble fills as
    tokens stream.
  - **`MessageComposer`** — textarea + Send; disabled while a response streams.
- **shadcn:** reuse `Button`; add `Textarea` and `ScrollArea`. Styling stays neutral;
  the theme pass restyles later.

---

## Testing (four layers, matching the foundation)

- **Unit** (node, faked SDK): `streamChat` yields tokens from a fake client; `generateTitle`
  returns a title; the Zod body schema accepts valid and rejects invalid input.
- **Integration** (node + real Postgres, Anthropic faked): `POST /api/chat` creates a
  conversation and persists **both** the user and assistant messages and generates a title;
  ownership enforced (**403** on another user's conversation); `GET /api/conversations`
  returns only the caller's; `GET /[id]` and `DELETE /[id]` (cascade) behave; invalid input
  returns **400**.
- **Component** (jsdom): transcript renders a message list; composer disables while
  streaming; sidebar renders, "New chat", and delete.
- **E2E** (Playwright, **canned SSE stream** — no credits spent): sign in → open `/chat` →
  send a message → streamed reply appears → the new conversation shows in the sidebar with a
  title. Anthropic is intercepted at the network layer.
- **Factory:** add `makeConversation` (and a small `makeMessage`) to `tests/factories/`.

---

## Config / environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (required) |
| `ANTHROPIC_MODEL` | Chat model id; defaults to `claude-sonnet-5` |

Title generation uses `claude-haiku-4-5` as a constant default. Add `ANTHROPIC_API_KEY` (and
optionally `ANTHROPIC_MODEL`) to `.env.example`, to local `.env.local`, and to Vercel's
Production + Preview environment variables. `ANTHROPIC_API_KEY` is a secret — it lives in
`.env.local` and Vercel, never in the tracked `.env`.

---

## New files at a glance

```
src/lib/anthropic.ts
src/app/api/chat/route.ts
src/app/api/conversations/route.ts            (GET list)
src/app/api/conversations/[id]/route.ts       (GET one, DELETE)
src/app/chat/page.tsx                          (replaces placeholder)
src/components/chat/chat-client.tsx
src/components/chat/conversation-sidebar.tsx
src/components/chat/chat-transcript.tsx
src/components/chat/message-composer.tsx
tests/factories/conversation.ts
tests/unit/…  tests/integration/…  tests/component/…  tests/e2e/…   (chat tests)
```
