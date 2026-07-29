# Upload Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side file upload to Vercel Blob (images/CSV/text/PDF, ≤4 MB), persisted to the existing `Upload` table and shown on the dashboard with image thumbnails and a delete action.

**Architecture:** Thin App Router route handlers delegate to injectable `src/lib/` modules — `lib/blob.ts` wraps `@vercel/blob` (with a `setBlobClient` unit seam and a `BLOB_MOCK` e2e seam), `lib/uploads.ts` owns validation + DB helpers. `POST /api/upload` reads `formData()`, validates type/size, streams to Blob, and writes the row. A `UploadPanel` client island on the dashboard handles upload/list/delete. Reuses the existing `Upload` table — **no migrations**.

**Tech Stack:** Next.js 16 (App Router, React 19, TS), `@vercel/blob`, Prisma + Postgres, Auth.js v5, Zod, Vitest + RTL, Playwright, shadcn/ui.

**Design spec:** [`docs/superpowers/specs/2026-07-29-upload-slice-design.md`](../specs/2026-07-29-upload-slice-design.md).

## Global Constraints

- **Framework:** Next.js 16 App Router, React 19, TypeScript. Thin route handlers delegate to `src/lib/` modules.
- **Prisma pinned `^6.19.3`** — never bump to 7.
- **No schema migrations** — reuse the existing `Upload` table (`id`, `userId` cascade, `filename`, `url`, `contentType`, `size` Int, `createdAt`, `@@index([userId, createdAt])`).
- **Mechanism:** server-side upload. Max size **4 MB** (`MAX_SIZE = 4 * 1024 * 1024`) — under Vercel's ~4.5 MB serverless body limit.
- **Content-type allowlist:** `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `text/csv`, `text/plain`, `application/pdf`.
- **Injectable blob client:** `lib/blob.ts` exposes `setBlobClient()` so unit/integration tests spend no network; e2e uses `BLOB_MOCK=1`. Tests never touch real Vercel Blob.
- **Error contract:** **400** invalid input / disallowed type · **401** unauthenticated · **403** another user's upload (surfaced as 404 via the null/false lib contract) · **404** unknown upload · **413** too large · **502** when Blob fails.
- **Secrets:** `BLOB_READ_WRITE_TOKEN` lives only in `.env.local` and Vercel, never in the tracked `.env`. `BLOB_MOCK` is local/CI-only, never on Vercel.
- **Coverage:** `src/app/**` excluded (e2e-tested); `src/lib/**` ≥90%; global ≥80%. Keep upload logic in `src/lib`.

---

## Task 1: Blob client library (`lib/blob.ts`)

**Files:**
- Create: `src/lib/blob.ts`
- Modify: `vitest.config.ts` (inline `@vercel/blob` for ESM), `.env.example`
- Test: `tests/unit/blob.test.ts`

**Interfaces:**
- Consumes: `@vercel/blob`.
- Produces:
  - `interface BlobLike { put(pathname: string, body: Blob, contentType: string): Promise<{ url: string }>; del(url: string): Promise<void> }`
  - `putBlob(pathname, body, contentType): Promise<{ url: string }>`
  - `deleteBlob(url: string): Promise<void>`
  - `setBlobClient(client: BlobLike | null): void`

- [ ] **Step 1: Install the SDK**

```bash
npm install @vercel/blob
```

- [ ] **Step 2: Add env var to `.env.example`**

Append to `.env.example`:

```bash

# Vercel Blob (upload slice) — get a token from the Vercel dashboard (Storage → Blob)
BLOB_READ_WRITE_TOKEN="replace-me"
```

> `BLOB_READ_WRITE_TOKEN` is a secret — put the real value in `.env.local` (gitignored) and Vercel, never in tracked `.env`/`.env.example`.

- [ ] **Step 3: Inline the SDK for Vitest**

In `vitest.config.ts`, extend the existing `server.deps.inline` array so it reads:

```typescript
      deps: {
        inline: [/next-auth/, /@auth\//, /@anthropic-ai\//, /@vercel\/blob/],
      },
```

- [ ] **Step 4: Write the failing unit test**

Create `tests/unit/blob.test.ts`:

```typescript
import { afterEach, expect, test, vi } from "vitest";
import { deleteBlob, putBlob, setBlobClient } from "@/lib/blob";

afterEach(() => setBlobClient(null));

test("putBlob delegates to the injected client and returns the url", async () => {
  const put = vi.fn().mockResolvedValue({ url: "https://blob/x.png" });
  setBlobClient({ put, del: vi.fn() });
  const body = new Blob(["hi"], { type: "image/png" });
  const result = await putBlob("uploads/u/x.png", body, "image/png");
  expect(result.url).toBe("https://blob/x.png");
  expect(put).toHaveBeenCalledWith("uploads/u/x.png", body, "image/png");
});

test("deleteBlob delegates to the injected client", async () => {
  const del = vi.fn().mockResolvedValue(undefined);
  setBlobClient({ put: vi.fn(), del });
  await deleteBlob("https://blob/x.png");
  expect(del).toHaveBeenCalledWith("https://blob/x.png");
});

test("uses the hermetic mock when BLOB_MOCK is set", async () => {
  setBlobClient(null);
  process.env.BLOB_MOCK = "1";
  try {
    const body = new Blob(["hi"], { type: "text/plain" });
    const { url } = await putBlob("uploads/u/note.txt", body, "text/plain");
    expect(url).toContain("blob.mock");
    await expect(deleteBlob(url)).resolves.toBeUndefined();
  } finally {
    delete process.env.BLOB_MOCK;
    setBlobClient(null);
  }
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `@/lib/blob` does not exist.

- [ ] **Step 6: Implement `src/lib/blob.ts`**

```typescript
import { del, put } from "@vercel/blob";

export interface BlobLike {
  put(pathname: string, body: Blob, contentType: string): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

let client: BlobLike | null = null;

function makeMockBlob(): BlobLike {
  return {
    async put(pathname) {
      return { url: `https://blob.mock/${pathname}` };
    },
    async del() {
      /* no-op */
    },
  };
}

function getClient(): BlobLike {
  if (client) return client;
  if (process.env.BLOB_MOCK) {
    client = makeMockBlob();
    return client;
  }
  /* v8 ignore next 8 -- real Vercel Blob calls need a live token; covered in prod, not tests */
  client = {
    async put(pathname, body, contentType) {
      const res = await put(pathname, body, { access: "public", contentType });
      return { url: res.url };
    },
    async del(url) {
      await del(url);
    },
  };
  return client;
}

/** Test seam: inject a fake blob client, or null to reset. */
export function setBlobClient(c: BlobLike | null): void {
  client = c;
}

export function putBlob(
  pathname: string,
  body: Blob,
  contentType: string,
): Promise<{ url: string }> {
  return getClient().put(pathname, body, contentType);
}

export function deleteBlob(url: string): Promise<void> {
  return getClient().del(url);
}
```

> `put`/`del` read `BLOB_READ_WRITE_TOKEN` from the environment automatically. The `v8 ignore` keeps the untestable real-client lines from dropping `lib/` below 90%; the mock branch and the seam are covered.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/blob.ts tests/unit/blob.test.ts vitest.config.ts .env.example package.json package-lock.json
git commit -m "feat: add injectable Vercel Blob client with mock seam"
```

---

## Task 2: Upload validation + data helpers (`lib/uploads.ts`) + factory

**Files:**
- Create: `src/lib/uploads.ts`, `tests/factories/upload.ts`
- Test: `tests/unit/upload-validation.test.ts`, `tests/integration/uploads.test.ts`

**Interfaces:**
- Consumes: `src/lib/db.ts` (`prisma`), `src/lib/blob.ts` (`deleteBlob`, `setBlobClient` in tests), `tests/factories/user.ts` (`makeUser`).
- Produces (`src/lib/uploads.ts`):
  - `ALLOWED_TYPES: Set<string>`, `MAX_SIZE = 4 * 1024 * 1024`.
  - `class UploadError extends Error { status: 400 | 413 }`.
  - `validateUpload(input: { contentType: string; size: number }): void` — throws `UploadError`.
  - `createUpload(userId, { filename, url, contentType, size }): Promise<Upload>`.
  - `listUploads(userId): Promise<Upload[]>` — newest first.
  - `getUpload(userId, id): Promise<Upload | null>` — null if not owned/missing.
  - `deleteUpload(userId, id): Promise<boolean>` — false if not owned/missing; on success deletes the blob then the row.
- Produces (`tests/factories/upload.ts`): `makeUpload(userId, overrides?): Promise<Upload>`.

- [ ] **Step 1: Create the factory**

Create `tests/factories/upload.ts`:

```typescript
import type { Upload } from "@prisma/client";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeUpload(
  userId: string,
  overrides: Partial<{
    filename: string;
    url: string;
    contentType: string;
    size: number;
  }> = {},
): Promise<Upload> {
  counter += 1;
  return testPrisma.upload.create({
    data: {
      userId,
      filename: overrides.filename ?? `file-${counter}.png`,
      url: overrides.url ?? `https://blob.mock/uploads/${userId}/file-${counter}.png`,
      contentType: overrides.contentType ?? "image/png",
      size: overrides.size ?? 1234,
    },
  });
}
```

- [ ] **Step 2: Write the failing validation unit test**

Create `tests/unit/upload-validation.test.ts`:

```typescript
import { expect, test } from "vitest";
import { UploadError, validateUpload } from "@/lib/uploads";

test("accepts an allowed type under the size cap", () => {
  expect(() =>
    validateUpload({ contentType: "image/png", size: 1000 }),
  ).not.toThrow();
});

test("rejects a disallowed content type with 400", () => {
  try {
    validateUpload({ contentType: "application/zip", size: 1000 });
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(UploadError);
    expect((e as UploadError).status).toBe(400);
  }
});

test("rejects an oversized file with 413", () => {
  try {
    validateUpload({ contentType: "image/png", size: 4 * 1024 * 1024 + 1 });
    throw new Error("should have thrown");
  } catch (e) {
    expect((e as UploadError).status).toBe(413);
  }
});
```

- [ ] **Step 3: Write the failing integration test**

Create `tests/integration/uploads.test.ts`:

```typescript
import { afterEach, expect, test, vi } from "vitest";
import {
  createUpload,
  deleteUpload,
  getUpload,
  listUploads,
} from "@/lib/uploads";
import { setBlobClient } from "@/lib/blob";
import { makeUser } from "../factories/user";
import { makeUpload } from "../factories/upload";

afterEach(() => setBlobClient(null));

test("createUpload persists an upload for the user", async () => {
  const user = await makeUser();
  const up = await createUpload(user.id, {
    filename: "a.png",
    url: "https://blob/a.png",
    contentType: "image/png",
    size: 10,
  });
  expect(up.userId).toBe(user.id);
  expect(up.filename).toBe("a.png");
});

test("listUploads returns only the caller's, newest first", async () => {
  const a = await makeUser({ email: "a@example.com" });
  const b = await makeUser({ email: "b@example.com" });
  const first = await makeUpload(a.id, { filename: "first.png" });
  const second = await makeUpload(a.id, { filename: "second.png" });
  await makeUpload(b.id, { filename: "other.png" });

  const list = await listUploads(a.id);
  expect(list.map((u) => u.filename)).toEqual(["second.png", "first.png"]);
  expect(list.map((u) => u.id)).toEqual([second.id, first.id]);
});

test("getUpload returns the row for the owner, null for others", async () => {
  const owner = await makeUser({ email: "o@example.com" });
  const other = await makeUser({ email: "x@example.com" });
  const up = await makeUpload(owner.id);
  expect((await getUpload(owner.id, up.id))?.id).toBe(up.id);
  expect(await getUpload(other.id, up.id)).toBeNull();
});

test("deleteUpload removes the blob and row for the owner only", async () => {
  const del = vi.fn().mockResolvedValue(undefined);
  setBlobClient({ put: vi.fn(), del });
  const owner = await makeUser({ email: "owner@example.com" });
  const other = await makeUser({ email: "nope@example.com" });
  const up = await makeUpload(owner.id, { url: "https://blob/del.png" });

  expect(await deleteUpload(other.id, up.id)).toBe(false);
  expect(del).not.toHaveBeenCalled();

  expect(await deleteUpload(owner.id, up.id)).toBe(true);
  expect(del).toHaveBeenCalledWith("https://blob/del.png");
  expect(await getUpload(owner.id, up.id)).toBeNull();
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: FAIL — `@/lib/uploads` does not exist.

- [ ] **Step 5: Implement `src/lib/uploads.ts`**

```typescript
import type { Upload } from "@prisma/client";
import { deleteBlob } from "@/lib/blob";
import { prisma } from "@/lib/db";

export const ALLOWED_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/csv",
  "text/plain",
  "application/pdf",
]);

export const MAX_SIZE = 4 * 1024 * 1024; // 4 MB

export class UploadError extends Error {
  status: 400 | 413;
  constructor(status: 400 | 413, message: string) {
    super(message);
    this.status = status;
    this.name = "UploadError";
  }
}

export function validateUpload(input: {
  contentType: string;
  size: number;
}): void {
  if (!ALLOWED_TYPES.has(input.contentType)) {
    throw new UploadError(400, "Unsupported file type");
  }
  if (input.size > MAX_SIZE) {
    throw new UploadError(413, "File too large");
  }
}

export function createUpload(
  userId: string,
  data: { filename: string; url: string; contentType: string; size: number },
): Promise<Upload> {
  return prisma.upload.create({ data: { userId, ...data } });
}

export function listUploads(userId: string): Promise<Upload[]> {
  return prisma.upload.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUpload(
  userId: string,
  id: string,
): Promise<Upload | null> {
  const up = await prisma.upload.findUnique({ where: { id } });
  if (!up || up.userId !== userId) return null;
  return up;
}

export async function deleteUpload(
  userId: string,
  id: string,
): Promise<boolean> {
  const up = await getUpload(userId, id);
  if (!up) return false;
  await deleteBlob(up.url);
  await prisma.upload.delete({ where: { id } });
  return true;
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/uploads.ts tests/factories/upload.ts tests/unit/upload-validation.test.ts tests/integration/uploads.test.ts
git commit -m "feat: add upload validation, data helpers, and makeUpload factory"
```

---

## Task 3: API route handlers

**Files:**
- Create: `src/app/api/upload/route.ts`, `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts`

**Interfaces:**
- Consumes: `src/lib/auth.ts` (`auth`), `src/lib/uploads.ts`, `src/lib/blob.ts` (`putBlob`).
- Produces: the three endpoints from the spec. `src/app/**` is excluded from unit coverage — verified by the Task 5 e2e and the build.

- [ ] **Step 1: Create `POST /api/upload`**

Create `src/app/api/upload/route.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { putBlob } from "@/lib/blob";
import { UploadError, createUpload, validateUpload } from "@/lib/uploads";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    validateUpload({ contentType: file.type, size: file.size });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let url: string;
  try {
    const pathname = `uploads/${userId}/${randomUUID()}-${file.name}`;
    ({ url } = await putBlob(pathname, file, file.type));
  } catch (err) {
    console.error("blob upload failed:", err);
    return NextResponse.json({ error: "Upload storage failed" }, { status: 502 });
  }

  const upload = await createUpload(userId, {
    filename: file.name,
    url,
    contentType: file.type,
    size: file.size,
  });
  return NextResponse.json(upload, { status: 201 });
}
```

- [ ] **Step 2: Create `GET /api/uploads`**

Create `src/app/api/uploads/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listUploads } from "@/lib/uploads";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  return NextResponse.json(await listUploads(userId));
}
```

- [ ] **Step 3: Create `DELETE /api/uploads/[id]`**

Create `src/app/api/uploads/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteUpload } from "@/lib/uploads";

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
  const ok = await deleteUpload(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Confirm it type-checks and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: clean compile; `next build` lists `/api/upload`, `/api/uploads`, `/api/uploads/[id]`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/upload src/app/api/uploads
git commit -m "feat: add upload, list, and delete API routes"
```

---

## Task 4: Upload UI (`UploadPanel`) + dashboard wiring

**Files:**
- Create: `src/components/upload/upload-panel.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Test: `tests/component/upload-panel.test.tsx`

**Interfaces:**
- Consumes: shadcn `Button`; `GET /api/uploads`, `POST /api/upload`, `DELETE /api/uploads/[id]`.
- Produces: `UploadPanel` client component (props `{ initialUploads: UiUpload[] }`) and `type UiUpload = { id: string; filename: string; url: string; contentType: string; size: number; createdAt: string }`.

- [ ] **Step 1: Write the failing component test**

Create `tests/component/upload-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { UploadPanel, type UiUpload } from "@/components/upload/upload-panel";

afterEach(() => vi.unstubAllGlobals());

const uploads: UiUpload[] = [
  {
    id: "1",
    filename: "photo.png",
    url: "https://blob/photo.png",
    contentType: "image/png",
    size: 2048,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
  {
    id: "2",
    filename: "data.csv",
    url: "https://blob/data.csv",
    contentType: "text/csv",
    size: 512,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
];

test("lists uploads with an image thumbnail for image types only", () => {
  render(<UploadPanel initialUploads={uploads} />);
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  expect(screen.getByText("data.csv")).toBeInTheDocument();
  const thumbs = screen.getAllByRole("img");
  expect(thumbs).toHaveLength(1);
  expect(thumbs[0]).toHaveAttribute("src", "https://blob/photo.png");
});

test("delete calls DELETE for the right id and refreshes", async () => {
  const fetchMock = vi
    .fn()
    // DELETE
    .mockResolvedValueOnce({ ok: true })
    // refresh GET
    .mockResolvedValueOnce({ ok: true, json: async () => [uploads[1]] });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<UploadPanel initialUploads={uploads} />);

  await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  expect(fetchMock).toHaveBeenCalledWith("/api/uploads/1", { method: "DELETE" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:component`
Expected: FAIL — `@/components/upload/upload-panel` does not exist.

- [ ] **Step 3: Implement `src/components/upload/upload-panel.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type UiUpload = {
  id: string;
  filename: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel({
  initialUploads,
}: {
  initialUploads: UiUpload[];
}) {
  const [uploads, setUploads] = useState<UiUpload[]>(initialUploads);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch("/api/uploads");
    if (res.ok) setUploads(await res.json());
  }

  async function onUpload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (res.ok) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        await refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
          className="text-sm"
        />
        <Button onClick={onUpload} disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {uploads.length === 0 ? (
        <p className="text-muted-foreground text-sm">No uploads yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-lg border p-2"
            >
              {u.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.url}
                  alt={u.filename}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <span className="text-muted-foreground flex h-10 w-10 items-center justify-center rounded border text-xs">
                  file
                </span>
              )}
              <div className="flex-1 truncate">
                <a href={u.url} className="truncate underline" target="_blank" rel="noreferrer">
                  {u.filename}
                </a>
                <div className="text-muted-foreground text-xs">
                  {formatBytes(u.size)} · {u.contentType} ·{" "}
                  {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => onDelete(u.id)}
                disabled={busy}
                aria-label={`Delete ${u.filename}`}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

> The `<img>` uses a plain tag (not `next/image`) because blob URLs are external and unconfigured; the eslint-disable documents that choice.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npm run test:component`
Expected: PASS.

- [ ] **Step 5: Wire the dashboard**

Replace `src/app/dashboard/page.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { listUploads } from "@/lib/uploads";
import { UploadPanel } from "@/components/upload/upload-panel";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const uploads = userId ? await listUploads(userId) : [];
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Signed in as {session?.user?.email}</p>
      <UploadPanel
        initialUploads={uploads.map((u) => ({
          id: u.id,
          filename: u.filename,
          url: u.url,
          contentType: u.contentType,
          size: u.size,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/components/upload tests/component/upload-panel.test.tsx src/app/dashboard/page.tsx
git commit -m "feat: add UploadPanel and wire it into the dashboard"
```

---

## Task 5: End-to-end smoke test

**Files:**
- Modify: `playwright.config.ts` (add `BLOB_MOCK` + dummy token to `webServer.env`)
- Test: `tests/e2e/upload-smoke.spec.ts`

**Interfaces:**
- Consumes: the running app; `BLOB_MOCK=1` makes `lib/blob` hermetic (fake URL, no-op delete).
- Produces: an e2e proving sign in → dashboard → upload a file → it appears → delete it.

- [ ] **Step 1: Add the mock env to Playwright's webServer**

In `playwright.config.ts`, add to `webServer.env` (alongside the existing entries):

```typescript
      BLOB_MOCK: "1",
      BLOB_READ_WRITE_TOKEN: "e2e-not-used",
```

- [ ] **Step 2: Write the e2e smoke spec**

Create `tests/e2e/upload-smoke.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("sign in, upload a file, see it listed, and delete it", async ({ page }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;
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

  // Select a small in-memory text file, then click Upload.
  await page.getByRole("main").locator('input[type="file"]').setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello upload"),
  });
  await page.getByRole("button", { name: /^upload$/i }).click();

  await expect(page.getByText("hello.txt")).toBeVisible();

  // Delete it.
  await page.getByRole("button", { name: /delete hello\.txt/i }).click();
  await expect(page.getByText("hello.txt")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — the new upload spec plus the existing auth/chat specs are green.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/upload-smoke.spec.ts
git commit -m "test: add hermetic e2e upload smoke test"
```

---

## Task 6: Coverage, env docs, and deployment wiring

**Files:**
- Modify: `README.md`, `docs/deploy.md`

**Interfaces:**
- Consumes: everything above.
- Produces: passing coverage thresholds, documented env, and Vercel deploy notes for `BLOB_READ_WRITE_TOKEN`.

- [ ] **Step 1: Run the full coverage suite**

Run: `npm run test:coverage`
Expected: all pass; `src/lib` ≥90% (new `lib/blob.ts` + `lib/uploads.ts` are exercised by the unit + integration tests), global ≥80%. If `lib/blob.ts` dips below 90%, add a unit test for the uncovered branch rather than lowering the threshold.

- [ ] **Step 2: Document the env var in the README**

Under the local-dev steps in `README.md`, add after the chat/`ANTHROPIC_API_KEY` note:

```markdown
> File upload needs `BLOB_READ_WRITE_TOKEN` in `.env.local` (create a Blob store in the Vercel dashboard → Storage → Blob, then copy its token).
```

- [ ] **Step 3: Add the Blob var to the deploy runbook**

In `docs/deploy.md`, add a row to the Vercel env table (Production + Preview):

```markdown
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for file upload | Vercel dashboard → Storage → Blob |
```

And note: do **not** set `BLOB_MOCK` on Vercel (local/CI e2e seam only).

- [ ] **Step 4: Final verification**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm run test:coverage`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/deploy.md
git commit -m "docs: document BLOB_READ_WRITE_TOKEN for local dev and Vercel"
```

- [ ] **Step 6: Deploy checklist (manual, in Vercel)**

- [ ] Create a Blob store (Vercel → Storage → Blob) and add `BLOB_READ_WRITE_TOKEN` to the project (Production + Preview).
- [ ] Push; confirm CI green.
- [ ] After deploy, sign in → dashboard → upload an image (see the thumbnail) and a CSV, then delete one.

---

## Self-Review Notes

Spec coverage:
- **Injectable Blob + mock seam:** Task 1 (`lib/blob.ts`, `setBlobClient`, `BLOB_MOCK`).
- **Validation (allowlist + 4 MB):** Task 2 (`validateUpload`, `UploadError` 400/413).
- **DB helpers + ownership + blob-delete-on-delete:** Task 2 (`createUpload`/`listUploads`/`getUpload`/`deleteUpload`).
- **Routes + error contract (400/401/404/413/502):** Task 3.
- **UI (form, list, thumbnails, delete):** Task 4 (`UploadPanel` + dashboard).
- **No credits/network in tests; hermetic e2e:** Task 1 seam + Task 5 (`BLOB_MOCK`).
- **No migrations:** reuses `Upload` throughout.
- **Four-layer tests:** unit (Tasks 1–2), integration (Task 2), component (Task 4), e2e (Task 5).
- **Env/config:** Task 1 (`BLOB_READ_WRITE_TOKEN`), Task 6 (docs + Vercel).

Deferred (per spec): client-direct/>4 MB uploads; drag-and-drop; progress bars; theme.
