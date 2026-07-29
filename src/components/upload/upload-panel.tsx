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
