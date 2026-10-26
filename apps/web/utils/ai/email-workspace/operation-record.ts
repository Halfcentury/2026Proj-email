import "server-only";
import { createHash } from "node:crypto";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type WorkspaceOperationReceipt = {
  completedAt: string;
  summary?: string;
  issues: string[];
  href?: string;
};
export function workspaceReviewKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function getWorkspaceOperationReceipt(
  emailAccountId: string,
  token: string,
) {
  const message = await prisma.chatMessage.findFirst({
    where: {
      id: `workspace-operation:${workspaceReviewKey(token)}`,
      chat: { emailAccountId, deletedAt: null },
    },
    select: { metadata: true },
  });
  return (
    (
      message?.metadata as {
        workspaceOperation?: WorkspaceOperationReceipt;
      } | null
    )?.workspaceOperation ?? null
  );
}

/** An execution receipt in existing ChatMessage metadata, not a task scheduler. */
export async function recordWorkspaceOperation(
  emailAccountId: string,
  token: string,
  threadId: string | undefined,
  receipt: WorkspaceOperationReceipt,
) {
  const key = workspaceReviewKey(token);
  const id = `workspace-operation:${key}`;
  const existing = await prisma.chatMessage.findFirst({
    where: { id, chat: { emailAccountId } },
    select: { id: true },
  });
  const original = await prisma.chatMessage.findFirst({
    where: {
      chat: { emailAccountId, deletedAt: null },
      metadata: { path: ["workspaceReviewKeys"], array_contains: [key] },
    },
    select: { chatId: true },
  });
  if (!existing) {
    const message = {
      id,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: receipt.issues.length
            ? `${receipt.summary ?? "邮件操作"}\n${receipt.issues.join("\n")}`
            : `${receipt.summary ?? "邮件操作"}已完成`,
        },
      ],
      metadata: {
        workspaceOperation: receipt,
        threadId: threadId ?? null,
      } as Prisma.InputJsonValue,
    };
    if (original)
      await prisma.chatMessage.create({
        data: { ...message, chatId: original.chatId },
      });
    else
      await prisma.chat.create({
        data: {
          emailAccountId,
          name: "邮件操作记录",
          messages: { create: message },
        },
      });
  }
  // Also restore the execution outcome in the original tool part for chat context.
  const messages = await prisma.chatMessage.findMany({
    where: {
      chat: { emailAccountId, deletedAt: null },
      metadata: { path: ["workspaceReviewKeys"], array_contains: [key] },
    },
    select: { id: true, parts: true, updatedAt: true },
    take: 10,
  });
  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue;
    const parts = message.parts.map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return part;
      const output = part.output;
      if (!output || typeof output !== "object" || Array.isArray(output))
        return part;
      const review = output.reviewToken ?? output.signature;
      return typeof review === "string" && workspaceReviewKey(review) === key
        ? { ...part, output: { ...output, confirmation: receipt } }
        : part;
    });
    await prisma.chatMessage.updateMany({
      where: { id: message.id, updatedAt: message.updatedAt },
      data: { parts: parts as Prisma.InputJsonValue },
    });
  }
}
