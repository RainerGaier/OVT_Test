import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteConversation, getConversation } from "@/lib/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const convo = await getConversation(userId, id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: convo.id,
    title: convo.title,
    messages: convo.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteConversation(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
