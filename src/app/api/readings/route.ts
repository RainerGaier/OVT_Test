import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listReadings, VALID_RANGES, type RangeDays } from "@/lib/readings";

const daysSchema = z.coerce
  .number()
  .refine(
    (n): n is RangeDays => (VALID_RANGES as readonly number[]).includes(n),
    { message: "days must be 7, 30, or 90" },
  );

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("days") ?? "30";
  const parsed = daysSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid days" }, { status: 400 });
  }

  return NextResponse.json(await listReadings(userId, parsed.data));
}
