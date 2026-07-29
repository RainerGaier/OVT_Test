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
