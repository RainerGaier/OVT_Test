import type { Conversation } from "@prisma/client";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeConversation(
  userId: string,
  overrides: Partial<{ title: string }> = {},
): Promise<Conversation> {
  counter += 1;
  return testPrisma.conversation.create({
    data: {
      userId,
      title: overrides.title ?? `Conversation ${counter}`,
    },
  });
}
