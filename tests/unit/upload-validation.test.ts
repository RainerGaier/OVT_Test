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
