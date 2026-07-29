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
