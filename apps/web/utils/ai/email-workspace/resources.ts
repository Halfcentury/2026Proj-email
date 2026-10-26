import "server-only";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { extractEmailAddress, extractEmailAddresses } from "@/utils/email";
import { getRecordedMeetingContext } from "@/utils/meeting-recorder/reply-context";
import {
  getFilableAttachments,
  suggestAttachmentFiling,
  executeFiling,
  type AttachmentFilingPlan,
} from "@/utils/drive/filing-engine";
import type { Logger } from "@/utils/logger";

export type ResourceOptions = {
  emailAccountId: string;
  provider: string;
  logger: Logger;
};
export async function getWorkspaceMessage(
  options: ResourceOptions,
  threadId: string,
  messageId?: string,
) {
  const emailProvider = await createEmailProvider(options);
  const messages = (await emailProvider.getThreadMessages(threadId)).filter(
    (message) => !message.labelIds?.includes("DRAFT"),
  );
  const message = messageId
    ? messages.find((message) => message.id === messageId)
    : messages
        .sort((a, b) => Number(a.internalDate) - Number(b.internalDate))
        .at(-1);
  if (!message) throw new SafeError("原邮件已变化，请刷新后重试。");
  return { emailProvider, message };
}
export async function getMeetingContext(
  options: ResourceOptions,
  threadId: string,
) {
  const { message } = await getWorkspaceMessage(options, threadId);
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: options.emailAccountId },
    select: { email: true },
  });
  const recipients = [
    message.headers.from,
    ...extractEmailAddresses(message.headers.to ?? ""),
    ...extractEmailAddresses(message.headers.cc ?? ""),
    ...extractEmailAddresses(message.headers.bcc ?? ""),
  ]
    .map((value) => extractEmailAddress(value))
    .filter(
      (value) => value && value.toLowerCase() !== account.email.toLowerCase(),
    );
  if (!recipients.length)
    return { meetings: [], issues: ["未找到可核对的其他邮件参与人。"] };
  const issues: string[] = [];
  const meetings = await getRecordedMeetingContext({
    emailAccountId: options.emailAccountId,
    recipientEmail: recipients[0],
    additionalRecipients: recipients.slice(1),
    logger: options.logger,
    onError: () => issues.push("会议资料查询失败，请稍后重试。"),
  });
  return {
    meetings: meetings.map((meeting) => ({
      ...meeting,
      startTime: meeting.startTime.toISOString(),
      href: meeting.id
        ? `/${options.emailAccountId}/meetings?meeting-id=${encodeURIComponent(meeting.id)}`
        : `/${options.emailAccountId}/meetings`,
    })),
    issues,
  };
}
async function filingContext(
  options: ResourceOptions,
  threadId: string,
  messageId: string,
  attachmentId: string,
) {
  const [{ emailProvider, message }, account, settings] = await Promise.all([
    getWorkspaceMessage(options, threadId, messageId),
    getEmailAccountWithAi({ emailAccountId: options.emailAccountId }),
    prisma.emailAccount.findUnique({
      where: { id: options.emailAccountId },
      select: {
        filingEnabled: true,
        filingPrompt: true,
        filingConfirmationSendEmail: true,
      },
    }),
  ]);
  if (!account || !settings) throw new SafeError("邮箱不存在。");
  const attachment = getFilableAttachments(message).find(
    (item) => item.attachmentId === attachmentId,
  );
  if (!attachment) throw new SafeError("未找到此邮件的可归档附件。");
  return {
    emailAccount: { ...account, ...settings },
    emailProvider,
    message,
    attachment,
    logger: options.logger,
    sendNotification: false,
  };
}
export async function suggestEmailAttachmentFiling(
  options: ResourceOptions,
  input: { threadId: string; messageId: string; attachmentId: string },
) {
  return suggestAttachmentFiling(
    await filingContext(
      options,
      input.threadId,
      input.messageId,
      input.attachmentId,
    ),
  );
}
export async function executeEmailFiling(
  options: ResourceOptions,
  input: { threadId: string; plan: AttachmentFilingPlan },
) {
  const context = await filingContext(
    options,
    input.threadId,
    input.plan.messageId,
    input.plan.attachmentId,
  );
  const result = await executeFiling({
    ...context,
    plan: input.plan,
    confirmed: true,
  });
  if (!result.success && !result.skipped)
    throw new SafeError(result.error ?? "归档失败，请核对已有文件后重试。");
  return {
    ...result,
    summary: `附件归档：${input.plan.filename} → ${input.plan.folderPath}`,
  };
}
