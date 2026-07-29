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
