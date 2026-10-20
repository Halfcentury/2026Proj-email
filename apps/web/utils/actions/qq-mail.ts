"use server";

import { z } from "zod";
import { actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  deleteImapAccount,
  getImapAccountSummary,
  getImapCredentials,
  listImapAccounts,
  saveImapAccount,
} from "@/utils/qq-mail/account";
import { classifyQqMessages, summarizeQqMessages } from "@/utils/qq-mail/ai";
import type { QqCategory } from "@/utils/qq-mail/types";
import {
  DEFAULT_ARCHIVE_FOLDER,
  IMAP_PAGE_SIZE,
  QQ_IMAP,
} from "@/utils/qq-mail/config";
import {
  archiveMessages,
  archiveSender,
  fetchInboxMessages,
  getInboxMessage,
  listInboxPage,
  testImapConnection,
} from "@/utils/qq-mail/imap";

const accountIdSchema = z.object({ accountId: z.string().min(1) });

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("authenticationfailed") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid credentials") ||
    lower.includes("login failed")
  ) {
    return "授权码不正确，或 QQ 邮箱未开启 IMAP 服务";
  }
  if (
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset")
  ) {
    return "无法连接 QQ 邮箱服务器，请检查网络后重试";
  }
  return message || "IMAP 操作失败，请稍后重试";
}

export const connectImapAccountAction = actionClientUser
  .metadata({ name: "connectImapAccount" })
  .inputSchema(
    z.object({
      email: z.string().trim().email("请输入正确的邮箱地址"),
      authCode: z.string().trim().min(1, "请输入授权码").max(200, "授权码过长"),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const email = parsedInput.email.toLowerCase();

    try {
      await testImapConnection({
        id: "pending",
        email,
        password: parsedInput.authCode,
        ...QQ_IMAP,
        archiveFolder: DEFAULT_ARCHIVE_FOLDER,
      });
      await saveImapAccount({
        userId: ctx.userId,
        email,
        authCode: parsedInput.authCode,
      });
      return { accounts: await listImapAccounts(ctx.userId) };
    } catch (error) {
      ctx.logger.warn("Failed to connect IMAP mailbox", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const listImapAccountsAction = actionClientUser
  .metadata({ name: "listImapAccounts" })
  .action(async ({ ctx }) => ({
    accounts: await listImapAccounts(ctx.userId),
  }));

export const listImapMessagesAction = actionClientUser
  .metadata({ name: "listImapMessages" })
  .inputSchema(
    accountIdSchema.extend({
      page: z.coerce.number().int().min(1).max(500).default(1),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    try {
      const credentials = await getImapCredentials(
        ctx.userId,
        parsedInput.accountId,
      );
      return await listInboxPage(credentials, parsedInput.page, IMAP_PAGE_SIZE);
    } catch (error) {
      ctx.logger.warn("Failed to list IMAP messages", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const getImapMessageAction = actionClientUser
  .metadata({ name: "getImapMessage" })
  .inputSchema(
    accountIdSchema.extend({
      uid: z.coerce.number().int().min(1),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    try {
      const credentials = await getImapCredentials(
        ctx.userId,
        parsedInput.accountId,
      );
      return await getInboxMessage(credentials, parsedInput.uid);
    } catch (error) {
      ctx.logger.warn("Failed to read IMAP message", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const archiveImapMessagesAction = actionClientUser
  .metadata({ name: "archiveImapMessages" })
  .inputSchema(
    accountIdSchema.extend({
      uids: z.array(z.coerce.number().int().min(1)).min(1).max(100),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    try {
      const credentials = await getImapCredentials(
        ctx.userId,
        parsedInput.accountId,
      );
      const archived = await archiveMessages(credentials, parsedInput.uids);
      return { archived };
    } catch (error) {
      ctx.logger.warn("Failed to archive IMAP messages", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const archiveImapSenderAction = actionClientUser
  .metadata({ name: "archiveImapSender" })
  .inputSchema(
    accountIdSchema.extend({
      from: z.string().trim().email("发件人地址无效"),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    try {
      const credentials = await getImapCredentials(
        ctx.userId,
        parsedInput.accountId,
      );
      const archived = await archiveSender(credentials, parsedInput.from);
      return { archived };
    } catch (error) {
      ctx.logger.warn("Failed to archive IMAP sender", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const disconnectImapAccountAction = actionClientUser
  .metadata({ name: "disconnectImapAccount" })
  .inputSchema(accountIdSchema)
  .action(async ({ ctx, parsedInput }) => {
    await deleteImapAccount(ctx.userId, parsedInput.accountId);
    return { accounts: await listImapAccounts(ctx.userId) };
  });

type QqMessageDto = {
  uid: number;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  receivedAt: string | null;
  unread: boolean;
  category: string | null;
  actionNeeded: boolean | null;
  aiSummary: string | null;
};

type QqMailboxState = {
  total: number;
  counts: {
    action_required: number;
    information: number;
    marketing: number;
    manual_review: number;
    unclassified: number;
  };
  messages: QqMessageDto[];
};

async function loadStoredMessages(
  userId: string,
  accountEmail: string,
): Promise<QqMailboxState> {
  const rows = await prisma.qqMailMessage.findMany({
    where: { userId, accountEmail },
    orderBy: [{ receivedAt: "desc" }, { uid: "desc" }],
  });

  const counts = {
    action_required: 0,
    information: 0,
    marketing: 0,
    manual_review: 0,
    unclassified: 0,
  };

  for (const row of rows) {
    if (!row.category) counts.unclassified += 1;
    else if (row.category in counts)
      counts[row.category as keyof typeof counts] += 1;
  }

  return {
    total: rows.length,
    counts,
    messages: rows.map((row) => ({
      uid: row.uid,
      subject: row.subject,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      unread: row.unread,
      category: row.category,
      actionNeeded: row.actionNeeded,
      aiSummary: row.aiSummary,
    })),
  };
}

/** Fetch the newest inbox messages, store them and classify any new ones. */
export const syncQqMessagesAction = actionClientUser
  .metadata({ name: "syncQqMessages" })
  .inputSchema(
    accountIdSchema.extend({
      limit: z.coerce.number().int().min(10).max(300).default(50),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    try {
      const credentials = await getImapCredentials(
        ctx.userId,
        parsedInput.accountId,
      );
      const fetched = await fetchInboxMessages(credentials, parsedInput.limit);

      for (const message of fetched) {
        const snippet = message.text.replace(/\s+/g, " ").trim().slice(0, 160);
        const data = {
          subject: message.subject,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          receivedAt: message.receivedAt ? new Date(message.receivedAt) : null,
          snippet,
          bodyText: message.text,
          unread: message.unread,
        };

        await prisma.qqMailMessage.upsert({
          where: {
            userId_accountEmail_uid: {
              userId: ctx.userId,
              accountEmail: credentials.email,
              uid: message.uid,
            },
          },
          create: {
            userId: ctx.userId,
            accountEmail: credentials.email,
            uid: message.uid,
            ...data,
          },
          update: data,
        });
      }

      const stored = await prisma.qqMailMessage.findMany({
        where: { userId: ctx.userId, accountEmail: credentials.email },
        orderBy: { receivedAt: "desc" },
      });
      const unclassified = stored.filter((row) => !row.category);

      if (unclassified.length) {
        const classified = await classifyQqMessages(
          unclassified.map((row) => ({
            uid: row.uid,
            subject: row.subject,
            from: row.fromAddress || row.fromName || "未知发件人",
            text: row.bodyText,
          })),
        );

        await Promise.all(
          [...classified.entries()].map(([uid, result]) =>
            prisma.qqMailMessage.update({
              where: {
                userId_accountEmail_uid: {
                  userId: ctx.userId,
                  accountEmail: credentials.email,
                  uid,
                },
              },
              data: {
                category: result.category,
                actionNeeded: result.actionNeeded,
                aiSummary: result.summary,
                classifiedAt: new Date(),
              },
            }),
          ),
        );
      }

      return await loadStoredMessages(ctx.userId, credentials.email);
    } catch (error) {
      ctx.logger.warn("Failed to sync QQ messages", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });

export const getQqMessagesAction = actionClientUser
  .metadata({ name: "getQqMessages" })
  .inputSchema(accountIdSchema)
  .action(async ({ ctx, parsedInput }) => {
    const account = await getImapAccountSummary(
      ctx.userId,
      parsedInput.accountId,
    );
    return loadStoredMessages(ctx.userId, account.email);
  });

/** Summarize the classified messages into overview, todos and notices. */
export const summarizeQqMessagesAction = actionClientUser
  .metadata({ name: "summarizeQqMessages" })
  .inputSchema(accountIdSchema)
  .action(async ({ ctx, parsedInput }) => {
    try {
      const account = await getImapAccountSummary(
        ctx.userId,
        parsedInput.accountId,
      );
      const rows = await prisma.qqMailMessage.findMany({
        where: {
          userId: ctx.userId,
          accountEmail: account.email,
          category: { not: null },
        },
        orderBy: [{ receivedAt: "desc" }, { uid: "desc" }],
        take: 300,
      });

      if (!rows.length) {
        throw new SafeError("还没有已分类的邮件，请先抓取并分类");
      }

      return await summarizeQqMessages(
        rows.map((row) => ({
          subject: row.subject,
          from: row.fromAddress || row.fromName || "未知发件人",
          category: (row.category ?? "manual_review") as QqCategory,
          summary: row.aiSummary ?? "",
          receivedAt: row.receivedAt?.toISOString() ?? null,
        })),
      );
    } catch (error) {
      ctx.logger.warn("Failed to summarize QQ messages", { error });
      throw new SafeError(toFriendlyError(error));
    }
  });
