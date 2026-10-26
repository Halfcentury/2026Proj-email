import { recordingInputSchema } from "@/utils/ai/email-workspace/recording-schema";
import { bookingPlanInputSchema } from "@/utils/ai/email-workspace/booking-schema";
import { tool, type InferUITool } from "ai";
import { z } from "zod";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

type Options = { emailAccountId: string; provider: string; logger: Logger };
const input = z.object({
  threadId: z
    .string()
    .min(1)
    .describe("Actual provider thread ID from readEmail or searchInbox."),
});
async function context(options: Options) {
  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: options.emailAccountId,
  });
  if (!emailAccount) throw new Error("邮箱不存在");
  const emailProvider = await createEmailProvider(options);
  return { ...options, emailAccount, emailProvider, record: false };
}
export const analyzeEmailTool = (options: Options) =>
  tool({
    description:
      "Read-only analysis of an email conversation, requests, reply need and matching rules. Never executes actions.",
    inputSchema: input,
    execute: async ({ threadId }) => {
      const { analyzeEmail } = await import(
        "@/utils/ai/email-workspace/service"
      );
      return analyzeEmail({ ...(await context(options)), threadId });
    },
  });
export const generateReplyTool = (options: Options) =>
  tool({
    description:
      "Generate a grounded reply using the complete shared RAG pipeline: actual knowledge quotes, history, memories, calendar, meeting and configured attachments. Returns draft, sources and missing facts. Does not send or overwrite a draft. Use this before preparing replyEmail; preserve placeholders and ask the user about missing facts.",
    inputSchema: input.extend({
      instructions: z
        .string()
        .max(2000)
        .optional()
        .describe("One-time reply requirements, not a permanent preference."),
    }),
    execute: async ({ threadId, instructions }) => {
      const { generateReply } = await import(
        "@/utils/ai/email-workspace/service"
      );
      return generateReply({
        ...(await context(options)),
        threadId,
        instructions,
      });
    },
  });
export type AnalyzeEmailTool = InferUITool<ReturnType<typeof analyzeEmailTool>>;
export type GenerateReplyTool = InferUITool<
  ReturnType<typeof generateReplyTool>
>;

export const getMeetingContextTool = (options: Options) =>
  tool({
    description:
      "Read meeting summaries applicable to the current email. Every email recipient must have attended; unavailable is not empty knowledge.",
    inputSchema: input,
    execute: async ({ threadId }) => {
      const { getMeetingContext } = await import(
        "@/utils/ai/email-workspace/resources"
      );
      return getMeetingContext(options, threadId);
    },
  });
export const suggestAttachmentFilingTool = (options: Options) =>
  tool({
    description:
      "Read-only filing suggestion for an actual attachment ID from readEmail. Displays exact cloud drive and target folder for explicit confirmation. Does not create folders or upload files.",
    inputSchema: input.extend({
      messageId: z.string().min(1),
      attachmentId: z.string().min(1),
    }),
    execute: async (args) => {
      const { suggestEmailAttachmentFiling } = await import(
        "@/utils/ai/email-workspace/resources"
      );
      return suggestEmailAttachmentFiling(options, args);
    },
  });
export const manageBookingTool = (options: Options) =>
  tool({
    description:
      "Prepare a booking creation, reschedule or cancellation for user confirmation. Requires actual source message, exact time, timezone, participant and owned booking link or booking ID. Never executes before the user clicks confirmation; conflicts are checked again then.",
    inputSchema: bookingPlanInputSchema,
    execute: async (args) => {
      const { getWorkspaceMessage } = await import(
        "@/utils/ai/email-workspace/resources"
      );
      const { prepareBooking } = await import(
        "@/utils/ai/email-workspace/booking"
      );
      await getWorkspaceMessage(options, args.threadId, args.messageId);
      return prepareBooking({
        emailAccountId: options.emailAccountId,
        input: args,
      });
    },
  });
export type MeetingContextTool = InferUITool<
  ReturnType<typeof getMeetingContextTool>
>;
export type SuggestAttachmentFilingTool = InferUITool<
  ReturnType<typeof suggestAttachmentFilingTool>
>;
export type ManageBookingTool = InferUITool<
  ReturnType<typeof manageBookingTool>
>;

export const configureMeetingRecordingTool = (options: Options) =>
  tool({
    description:
      "Prepare explicit confirmation to enable/disable meeting recording or request/stop recording a specific actual calendar event. Reuses existing recorder scheduling and release services; never changes settings before confirmation.",
    inputSchema: recordingInputSchema,
    execute: async (input) => {
      const { prepareMeetingRecording } = await import(
        "@/utils/ai/email-workspace/recording"
      );
      return prepareMeetingRecording(options, input);
    },
  });
export type ConfigureMeetingRecordingTool = InferUITool<
  ReturnType<typeof configureMeetingRecordingTool>
>;

export const getEmailWorkspaceResourcesTool = (options: Options) =>
  tool({
    description:
      "Read owned booking links and actual bookings/meetings associated with this email thread. Call before manageBooking to discover IDs; never invent IDs. If more than one booking matches, ask the user which one. No writes.",
    inputSchema: input,
    execute: async ({ threadId }) => {
      const { getWorkspaceMessage } = await import(
        "@/utils/ai/email-workspace/resources"
      );
      const { getWorkspaceResources } = await import(
        "@/utils/ai/email-workspace/workspace-resources"
      );
      await getWorkspaceMessage(options, threadId);
      return getWorkspaceResources(options.emailAccountId, threadId);
    },
  });
export type GetEmailWorkspaceResourcesTool = InferUITool<
  ReturnType<typeof getEmailWorkspaceResourcesTool>
>;
