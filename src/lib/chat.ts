import { z } from "zod";
import { generateTitle, type ChatMessage } from "@/lib/anthropic";
import {
  addMessage,
  createConversation,
  messagesForClaude,
  setConversationTitle,
} from "@/lib/conversations";
import { prisma } from "@/lib/db";

export class ChatError extends Error {
  status: 400 | 403 | 404;
  constructor(status: 400 | 403 | 404, message: string) {
    super(message);
    this.status = status;
    this.name = "ChatError";
  }
}

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
});

export async function prepareChatTurn(
  userId: string,
  input: { conversationId?: unknown; message: unknown },
): Promise<{
  conversationId: string;
  isNew: boolean;
  claudeMessages: ChatMessage[];
  firstUserMessage: string;
}> {
  const parsed = chatSchema.safeParse(input);
  if (!parsed.success) throw new ChatError(400, "Invalid input");
  const { conversationId, message } = parsed.data;

  let id: string;
  let isNew = false;
  if (conversationId) {
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!convo) throw new ChatError(404, "Conversation not found");
    if (convo.userId !== userId) throw new ChatError(403, "Forbidden");
    id = convo.id;
  } else {
    id = (await createConversation(userId)).id;
    isNew = true;
  }

  await addMessage(id, "user", message);
  const claudeMessages = await messagesForClaude(id);
  return { conversationId: id, isNew, claudeMessages, firstUserMessage: message };
}

export async function finishChatTurn(
  conversationId: string,
  isNew: boolean,
  firstUserMessage: string,
  assistantText: string,
): Promise<void> {
  await addMessage(conversationId, "assistant", assistantText);
  if (isNew) {
    const title = await generateTitle(firstUserMessage, assistantText);
    await setConversationTitle(conversationId, title);
  }
}
