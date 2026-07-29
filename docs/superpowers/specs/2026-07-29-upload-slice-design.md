# Upload Slice Design

**Status:** Approved for planning (2026-07-29)

**Goal:** Add file upload on the deployed Foundation + Auth + Chat base. A signed-in
user uploads files (images, CSV/text, PDF) to Vercel Blob from the dashboard; each
upload is persisted to Postgres and listed with image thumbnails and a delete action.

**Builds on:** the foundation and the chat slice's proven patterns — Next.js 16 App
Router, Prisma + Postgres, Auth.js (`session.user.id`), the injectable-`lib/`-module
pattern, the `_MOCK` e2e seam, and the four-layer test strategy. Reuses the existing
`Upload` table — **no migrations**.

**Out of scope (YAGNI):** client-direct (browser→Blob) uploads and files >4 MB;
drag-and-drop; upload progress bars; the app-wide theme (separate pass).

---

## Decisions

- **Mechanism:** server-side upload. The browser POSTs the file to `POST /api/upload`,
  which validates and streams it to Vercel Blob, then writes the `Upload` row. Simple
  and fully hermetic to test. **Capped at 4 MB** to stay under Vercel's ~4.5 MB
  serverless request-body limit (this supersedes the earlier design doc's aspirational
  "10 MB", which server-side uploads cannot reach on Vercel).
- **Storage:** Vercel Blob via `@vercel/blob` (`put` / `del`), wrapped in an injectable
  `lib/blob.ts` (unit tests inject a fake; e2e uses a `BLOB_MOCK` seam). Swapping Blob
  for S3 later touches one file.
- **Content-type allowlist (server-enforced):** `image/png`, `image/jpeg`, `image/gif`,
  `image/webp`, `text/csv`, `text/plain`, `application/pdf`. Anything else → **400**.
- **Size limit:** ≤ 4 MB → else **413**.
- **UI:** the `/dashboard` gains an uploads section — a file input + Upload button and a
  list (filename · size · type · date · link), with **image thumbnails** for image
  types and a **delete** button per row.
- **Delete** removes the `Upload` row **and** the blob (ownership-checked).

---

## Data model

No schema changes. Existing table:

- `Upload` — `id`, `userId` (cascade), `filename`, `url`, `contentType`, `size` (Int
  bytes), `createdAt`, `@@index([userId, createdAt])`.

---

## `lib/blob.ts` (injectable, mirrors `lib/anthropic.ts`)

Wraps `@vercel/blob` behind an injectable client so unit/integration tests spend no
network and e2e stays hermetic.

- `putBlob(pathname: string, body: Blob | Buffer, contentType: string): Promise<{ url: string }>`
  — wraps `put(pathname, body, { access: "public", contentType, token })`.
- `deleteBlob(url: string): Promise<void>` — wraps `del(url, { token })`.
- `setBlobClient(client | null)` — unit test seam.
- A `BLOB_MOCK` branch returns a deterministic fake URL from `putBlob` and a no-op
  `deleteBlob` (used by e2e), constructed inline (no runtime path-alias `require`).

Blob pathname is namespaced per user to avoid collisions, e.g.
`uploads/${userId}/${cuid}-${filename}`.

---

## `lib/uploads.ts` (DB helpers + validation)

- `ALLOWED_TYPES: Set<string>` and `MAX_SIZE = 4 * 1024 * 1024`.
- `class UploadError extends Error { status: 400 | 413 }` — thrown by validation.
- `validateUpload({ contentType, size })` — throws `UploadError(400)` for a
  disallowed type, `UploadError(413)` when over `MAX_SIZE`.
- `createUpload(userId, { filename, url, contentType, size }): Promise<Upload>`.
- `listUploads(userId): Promise<Upload[]>` — newest first.
- `getUpload(userId, id): Promise<Upload | null>` — null if not owned/missing.
- `deleteUpload(userId, id): Promise<boolean>` — false if not owned/missing; on
  success removes the blob (`deleteBlob(upload.url)`) then the row.

> The blob write itself lives in the route (it needs the `File` from `formData()`),
> keeping `lib/uploads.ts` DB-focused and easy to test; `deleteUpload` owns the blob
> delete because it already has the stored `url`.

---

## API routes (thin → lib)

| Route | Purpose |
|---|---|
| `POST /api/upload` | Upload one file |
| `GET /api/uploads` | List the signed-in user's uploads |
| `DELETE /api/uploads/[id]` | Delete an upload (row + blob), ownership-checked |

### `POST /api/upload`
1. `auth()` → `userId` (**401** if unauthenticated).
2. `const form = await request.formData(); const file = form.get("file")` — **400** if
   not a `File`.
3. `validateUpload({ contentType: file.type, size: file.size })` → **400** / **413**.
4. `putBlob("uploads/${userId}/${cuid}-${file.name}", file, file.type)` — on failure
   **502**.
5. `createUpload(userId, { filename: file.name, url, contentType: file.type, size: file.size })`.
6. Return the created row (201).

### `GET /api/uploads`
Auth (401) → `listUploads(userId)`.

### `DELETE /api/uploads/[id]`
Auth (401) → `deleteUpload(userId, id)` → **404** if false (ownership enforced in the
lib). `await params` (Next 16 Promise params). Returns 204.

---

## Error handling

- **400** invalid input (missing file / disallowed content type) · **401**
  unauthenticated · **403** another user's upload (surfaced as 404 by the null/false
  contract, matching the chat slice) · **404** unknown upload · **413** too large ·
  **502** when Vercel Blob fails.

---

## UI

- **`/dashboard`** (server component) fetches `listUploads(userId)` and renders an
  `UploadPanel` client island alongside the existing "Signed in as …" content.
- **`src/components/upload/upload-panel.tsx`** (client): file input + Upload button;
  the list of uploads (filename, human-readable size, type, date, a link to the blob
  URL); an `<img>` thumbnail for image content types; a delete button per row. Uploading
  disables the form; upload/delete refresh the list via `GET /api/uploads`.
- shadcn: reuse `Button`; a plain `<input type="file">` (styled) is enough.

---

## Testing (four layers, hermetic — no real Blob or network)

- **Unit:** `lib/blob.ts` with an injected fake client (`putBlob` returns the fake URL;
  `deleteBlob` calls the client) and the `BLOB_MOCK` branch; `validateUpload` accepts
  allowed types and rejects a disallowed type (400) and an oversized file (413).
- **Integration** (node + real Postgres, blob faked): `createUpload`/`listUploads`
  (scoped to the user, newest first); ownership — `getUpload`/`deleteUpload` return
  null/false for another user; `deleteUpload` removes the row **and** calls the blob
  delete; validation errors carry the right status.
- **Component** (jsdom): `UploadPanel` renders the list, shows an `<img>` thumbnail for
  an image upload, wires the delete button to the right id, disables while uploading.
- **E2E** (Playwright, `BLOB_MOCK` — no real Blob): sign in → dashboard → upload a small
  file via `setInputFiles` → it appears in the list → delete it. Factory: `makeUpload`.

---

## Config / environment

| Variable | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access (required for real uploads) |

`BLOB_READ_WRITE_TOKEN` is a secret — it lives in `.env.local` and Vercel (Production +
Preview), never in the tracked `.env`. `BLOB_MOCK` is a local/CI e2e seam and must
**not** be set on Vercel. Coverage: keep upload logic in `src/lib` (≥90%); `src/app`
stays excluded.

---

## New files at a glance

```
src/lib/blob.ts
src/lib/uploads.ts
src/app/api/upload/route.ts                 (POST)
src/app/api/uploads/route.ts                (GET list)
src/app/api/uploads/[id]/route.ts           (DELETE)
src/app/dashboard/page.tsx                  (modified: fetch uploads + render UploadPanel)
src/components/upload/upload-panel.tsx
tests/factories/upload.ts
tests/unit/…  tests/integration/…  tests/component/…  tests/e2e/…   (upload tests)
```
