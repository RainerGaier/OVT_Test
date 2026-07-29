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
