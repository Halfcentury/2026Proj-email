"use server";

import {
  calendarQuerySchema,
  queryCalendar,
} from "@/utils/ai/email-workspace/calendar";
import {
  prepareBooking,
  manageBooking,
} from "@/utils/ai/email-workspace/booking";
import {
  getMeetingContext,
  suggestEmailAttachmentFiling,
  executeEmailFiling,
  getWorkspaceMessage,
} from "@/utils/ai/email-workspace/resources";
import { filingPlanSchema } from "@/utils/drive/filing-plan-schema";
import { recordingInputSchema } from "@/utils/ai/email-workspace/recording-schema";
import {
  prepareMeetingRecording,
  configureMeetingRecording,
} from "@/utils/ai/email-workspace/recording";
import { bookingPlanInputSchema } from "@/utils/ai/email-workspace/booking-schema";
import { selectedAttachmentSchema } from "@/utils/attachments/source-schema";
import { resolveDraftAttachments } from "@/utils/attachments/draft-attachments";
import prisma from "@/utils/prisma";
import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAi } from "@/utils/user/get";
import {
  analyzeEmail,
  generateReply,
  getLatestWorkspaceResults,
} from "@/utils/ai/email-workspace/service";

import {
  getWorkspaceOperationReceipt,
  recordWorkspaceOperation,
} from "@/utils/ai/email-workspace/operation-record";

const input = z.object({ threadId: z.string().min(1).max(1024) });

export const analyzeEmailAction = actionClient
  .metadata({ name: "analyzeEmail" })
  .inputSchema(input)
  .action(
    async ({
      ctx: { emailAccountId, userId, provider, logger },
      parsedInput: { threadId },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount || emailAccount.userId !== userId)
        throw new SafeError("无法读取此邮箱。");
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      return analyzeEmail({ emailAccount, emailProvider, threadId, logger });
    },
  );

export const generateWorkspaceReplyAction = actionClient
  .metadata({ name: "generateWorkspaceReply" })
  .inputSchema(input.extend({ instructions: z.string().max(2000).optional() }))
  .action(
    async ({
      ctx: { emailAccountId, userId, provider, logger },
      parsedInput: { threadId, instructions },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount || emailAccount.userId !== userId)
        throw new SafeError("无法读取此邮箱。");
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      return generateReply({
        emailAccount,
        emailProvider,
        threadId,
        instructions,
        logger,
      });
    },
  );

export const getEmailWorkspaceResultsAction = actionClient
  .metadata({ name: "getEmailWorkspaceResults" })
  .inputSchema(input)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { threadId } }) =>
    getLatestWorkspaceResults(emailAccountId, threadId),
  );

export const queryWorkspaceCalendarAction = actionClient
  .metadata({ name: "queryWorkspaceCalendar" })
  .inputSchema(calendarQuerySchema)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) =>
    queryCalendar({ emailAccountId, logger, ...parsedInput }),
  );
export const getWorkspaceMeetingContextAction = actionClient
  .metadata({ name: "getWorkspaceMeetingContext" })
  .inputSchema(input)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId },
    }) => getMeetingContext({ emailAccountId, provider, logger }, threadId),
  );
export const suggestWorkspaceFilingAction = actionClient
  .metadata({ name: "suggestWorkspaceFiling" })
  .inputSchema(
    input.extend({
      messageId: z.string().min(1),
      attachmentId: z.string().min(1),
    }),
  )
  .action(async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) =>
    suggestEmailAttachmentFiling(
      { emailAccountId, provider, logger },
      parsedInput,
    ),
  );
export const executeWorkspaceFilingAction = actionClient
  .metadata({ name: "executeWorkspaceFiling" })
  .inputSchema(input.extend({ plan: filingPlanSchema }))
  .action(async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) =>
    executeAndRecord(
      emailAccountId,
      parsedInput.plan.signature,
      parsedInput.threadId,
      () =>
        executeEmailFiling({ emailAccountId, provider, logger }, parsedInput),
    ),
  );
export const prepareWorkspaceBookingAction = actionClient
  .metadata({ name: "prepareWorkspaceBooking" })
  .inputSchema(bookingPlanInputSchema)
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      await getWorkspaceMessage(
        { emailAccountId, provider, logger },
        parsedInput.threadId,
        parsedInput.messageId,
      );
      return prepareBooking({ emailAccountId, input: parsedInput });
    },
  );
export const confirmWorkspaceBookingAction = actionClient
  .metadata({ name: "confirmWorkspaceBooking" })
  .inputSchema(z.object({ reviewToken: z.string().min(1).max(20_000) }))
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { reviewToken } }) =>
      executeAndRecord(emailAccountId, reviewToken, undefined, () =>
        manageBooking({ emailAccountId, reviewToken, logger }),
      ),
  );
export const getWorkspaceResourcesAction = actionClient
  .metadata({ name: "getWorkspaceResources" })
  .inputSchema(input)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId },
    }) => {
      await getWorkspaceMessage({ emailAccountId, provider, logger }, threadId);
      const { getWorkspaceResources } = await import(
        "@/utils/ai/email-workspace/workspace-resources"
      );
      return getWorkspaceResources(emailAccountId, threadId);
    },
  );
export const downloadWorkspaceReplyAttachmentAction = actionClient
  .metadata({ name: "downloadWorkspaceReplyAttachment" })
  .inputSchema(selectedAttachmentSchema)
  .action(async ({ ctx: { emailAccountId, userId, logger }, parsedInput }) => {
    const document = await prisma.attachmentDocument.findFirst({
      where: {
        fileId: parsedInput.fileId,
        attachmentSource: {
          driveConnectionId: parsedInput.driveConnectionId,
          rule: { emailAccountId },
        },
      },
      select: { id: true },
    });
    if (!document)
      throw new SafeError("所选附件已不在配置范围内，请重新生成建议。");
    const attachments = await resolveDraftAttachments({
      emailAccountId,
      userId,
      selectedAttachments: [parsedInput],
      logger,
    });
    const attachment = attachments[0];
    if (!attachment) throw new SafeError("附件无法读取，请重新选择。");
    if (!Buffer.isBuffer(attachment.content))
      throw new SafeError("附件内容无法读取。");
    const content = attachment.content;
    return {
      filename:
        typeof attachment.filename === "string"
          ? attachment.filename
          : parsedInput.filename,
      mimeType:
        typeof attachment.contentType === "string"
          ? attachment.contentType
          : parsedInput.mimeType,
      data: content.toString("base64"),
    };
  });
export const prepareWorkspaceRecordingAction = actionClient
  .metadata({ name: "prepareWorkspaceRecording" })
  .inputSchema(recordingInputSchema)
  .action(async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) =>
    prepareMeetingRecording({ emailAccountId, provider, logger }, parsedInput),
  );
export const confirmWorkspaceRecordingAction = actionClient
  .metadata({ name: "confirmWorkspaceRecording" })
  .inputSchema(z.object({ reviewToken: z.string().min(1).max(20_000) }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { reviewToken } }) =>
    executeAndRecord(emailAccountId, reviewToken, undefined, () =>
      configureMeetingRecording(emailAccountId, reviewToken),
    ),
  );

export const getWorkspaceReplyMessageAction = actionClient
  .metadata({ name: "getWorkspaceReplyMessage" })
  .inputSchema(input.extend({ messageId: z.string().min(1) }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, messageId },
    }) => {
      const { message } = await getWorkspaceMessage(
        { emailAccountId, provider, logger },
        threadId,
      );
      if (message.id !== messageId)
        throw new SafeError("会话已有更新，请重新生成回复后再编辑。");
      return message;
    },
  );

export const getWorkspaceOperationStatusAction = actionClient
  .metadata({ name: "getWorkspaceOperationStatus" })
  .inputSchema(z.object({ token: z.string().min(1).max(20_000) }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { token } }) => ({
    receipt: await getWorkspaceOperationReceipt(emailAccountId, token),
  }));

async function executeAndRecord<T extends object>(
  emailAccountId: string,
  token: string,
  threadId: string | undefined,
  execute: () => Promise<T>,
) {
  const previous = await getWorkspaceOperationReceipt(emailAccountId, token);
  if (previous)
    return { ...previous, issues: previous.issues, alreadyCompleted: true };
  const result = await execute();
  const receipt = {
    completedAt: new Date().toISOString(),
    ...("summary" in result && typeof result.summary === "string"
      ? { summary: result.summary }
      : {}),
    issues:
      "issues" in result && Array.isArray(result.issues)
        ? (result.issues as string[])
        : [],
    ...("href" in result && typeof result.href === "string"
      ? { href: result.href }
      : {}),
  };
  try {
    await recordWorkspaceOperation(
      emailAccountId,
      token,
      threadId ??
        ("threadId" in result && typeof result.threadId === "string"
          ? result.threadId
          : undefined),
      receipt,
    );
  } catch {
    receipt.issues = [
      ...receipt.issues,
      "操作已执行，但处理记录保存失败。请核对实际结果，勿重复执行。",
    ];
  }
  return { ...result, ...receipt };
}

export const suggestWorkspaceBookingAction = actionClient
  .metadata({ name: "suggestWorkspaceBooking" })
  .inputSchema(input.extend({ instructions: z.string().max(2000) }))
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      const { suggestBooking } = await import(
        "@/utils/ai/email-workspace/suggest-booking"
      );
      return suggestBooking(
        { emailAccountId, provider, logger },
        parsedInput.threadId,
        parsedInput.instructions,
      );
    },
  );

export const getWorkspaceFeedbackSettingsAction = actionClient
  .metadata({ name: "getWorkspaceFeedbackSettings" })
  .inputSchema(input)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId },
    }) => {
      const { message } = await getWorkspaceMessage(
        { emailAccountId, provider, logger },
        threadId,
      );
      const { extractEmailAddress } = await import("@/utils/email");
      const sender = extractEmailAddress(message.headers.from);
      const [account, categories, newsletter] = await Promise.all([
        prisma.emailAccount.findUniqueOrThrow({
          where: { id: emailAccountId },
          select: { writingStyle: true },
        }),
        prisma.category.findMany({
          where: { emailAccountId },
          select: { id: true, name: true },
        }),
        prisma.newsletter.findUnique({
          where: { email_emailAccountId: { email: sender, emailAccountId } },
          select: { categoryId: true },
        }),
      ]);
      return {
        writingStyle: account.writingStyle ?? "",
        categories,
        sender,
        categoryId: newsletter?.categoryId ?? null,
      };
    },
  );

export const getWorkspaceSourceAction = actionClient
  .metadata({ name: "getWorkspaceSource" })
  .inputSchema(
    z.object({
      kind: z.enum(["reply-memory", "attachment"]),
      id: z.string().min(1),
      connection: z.string().optional(),
    }),
  )
  .action(async ({ ctx: { emailAccountId, userId, logger }, parsedInput }) => {
    if (parsedInput.kind === "reply-memory") {
      const memory = await prisma.replyMemory.findFirst({
        where: { id: parsedInput.id, emailAccountId },
      });
      if (!memory) throw new SafeError("未找到此邮箱的回复经验。");
      return {
        title: "回复经验",
        content: memory.content,
        scope: `${{ GLOBAL: "整个邮箱", SENDER: "发件人", DOMAIN: "邮件域名", TOPIC: "主题" }[memory.scopeType]}${memory.scopeValue ? ` · ${memory.scopeValue}` : ""}`,
        observedAt: memory.updatedAt.toISOString(),
        href: null,
      };
    }
    const doc = await prisma.attachmentDocument.findFirst({
      where: {
        fileId: parsedInput.id,
        attachmentSource: {
          emailAccountId,
          driveConnectionId: parsedInput.connection ?? "",
          driveConnection: {
            emailAccount: { userId },
            emailAccountId,
            isConnected: true,
          },
        },
      },
      include: { attachmentSource: { include: { driveConnection: true } } },
    });
    if (!doc) throw new SafeError("此文件不在当前邮箱已配置的附件来源中。");
    const { createDriveProviderWithRefresh } = await import(
      "@/utils/drive/provider"
    );
    const drive = await createDriveProviderWithRefresh(
      doc.attachmentSource.driveConnection,
      logger,
    );
    const file = await drive.getFile(doc.fileId);
    return {
      title: doc.name,
      content: doc.content ?? "未提取正文",
      scope: doc.attachmentSource.name,
      observedAt: doc.updatedAt.toISOString(),
      href: file?.webUrl ?? null,
    };
  });

export const readWorkspaceAttachmentAction = actionClient
  .metadata({ name: "readWorkspaceAttachment" })
  .inputSchema(
    input.extend({
      messageId: z.string().min(1),
      attachmentId: z.string().min(1),
    }),
  )
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      const { emailProvider, message } = await getWorkspaceMessage(
        { emailAccountId, provider, logger },
        parsedInput.threadId,
        parsedInput.messageId,
      );
      const { readEmailAttachment } = await import(
        "@/utils/attachments/read-email-attachment"
      );
      return readEmailAttachment({
        emailProvider,
        message,
        attachmentId: parsedInput.attachmentId,
        logger,
      });
    },
  );
