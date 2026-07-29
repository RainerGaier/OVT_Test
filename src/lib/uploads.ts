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
