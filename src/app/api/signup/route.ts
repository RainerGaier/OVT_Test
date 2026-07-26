import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { registerUser } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const { email, password } = (body ?? {}) as Record<string, unknown>;
    const user = await registerUser({ email, password });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && /already registered/i.test(err.message)) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
