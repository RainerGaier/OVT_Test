import type { Conversation, Message } from "@prisma/client";
import { prisma } from "@/lib/db";

export function createConversation(userId: string): Promise<Conversation> {
  return prisma.conversation.create({
    data: { userId, title: "New conversation" },
  });
}

export function listConversations(
  userId: string,
): Promise<{ id: string; title: string; createdAt: Date }[]> {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<(Conversation & { messages: Message[] }) | null> {
  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!convo || convo.userId !== userId) return null;
  return convo;
}

export async function deleteConversation(
  userId: string,
  id: string,
): Promise<boolean> {
  const convo = await prisma.conversation.findUnique({ where: { id } });
  if (!convo || convo.userId !== userId) return false;
  await prisma.conversation.delete({ where: { id } });
  return true;
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Message> {
  return prisma.message.create({
    data: { conversationId, role, content },
  });
}

export async function messagesForClaude(
  conversationId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

export async function setConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await prisma.conversation.update({ where: { id }, data: { title } });
}
