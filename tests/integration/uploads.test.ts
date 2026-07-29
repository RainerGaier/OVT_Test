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
