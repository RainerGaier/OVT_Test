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
