import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSampleReadings } from "@/lib/readings";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const count = await generateSampleReadings(userId);
  return NextResponse.json({ count }, { status: 201 });
}
