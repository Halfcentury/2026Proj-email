import { selectedAttachmentSchema } from "@/utils/attachments/source-schema";
import { z } from "zod";

export const contextSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "email",
    "knowledge",
    "reply_memory",
    "calendar",
    "meeting",
    "attachment",
    "writing_style",
  ]),
  recordId: z.string().min(1),
  emailAccountId: z.string().min(1),
  title: z.string(),
  excerpt: z.string(),
  observedAt: z.string(),
  href: z.string().nullable(),
});

export type ContextSource = z.infer<typeof contextSourceSchema>;

export const contextIssueSchema = z.object({
  source: z.string(),
  message: z.string(),
});

export type ContextIssue = z.infer<typeof contextIssueSchema>;

export const relatedResourceSchema = z.object({
  type: z.enum(["calendar", "booking", "meeting", "attachment"]),
  id: z.string(),
  title: z.string(),
  href: z.string(),
  status: z.string().nullable(),
});

export type RelatedResource = z.infer<typeof relatedResourceSchema>;

export const emailAnalysisSchema = z.object({
  summary: z
    .string()
    .describe("A concise factual summary of the conversation."),
  requests: z
    .array(z.string())
    .describe("Questions and requests in the email."),
  needsReply: z.boolean(),
  replyReason: z.string(),
  missingInformation: z
    .array(z.string())
    .describe(
      "Facts or decisions that the user must confirm. Never guess them.",
    ),
  relatedNeeds: z.array(z.enum(["calendar", "meeting", "attachment"])),
  suggestedActions: z
    .array(
      z.object({
        type: z.enum([
          "reply",
          "archive",
          "mark_read",
          "label",
          "calendar",
          "meeting",
          "attachment",
        ]),
        reason: z.string(),
      }),
    )
    .default([]),
});

export const emailWorkspaceResultSchema = z.object({
  version: z.literal(1),
  aiRunId: z.string(),
  kind: z.enum(["analysis", "reply"]),
  emailAccountId: z.string(),
  threadId: z.string(),
  messageId: z.string(),
  createdAt: z.string(),
  status: z.enum(["completed", "partial"]),
  analysis: emailAnalysisSchema.nullable(),
  matchedRules: z.array(
    z.object({ id: z.string(), name: z.string(), reason: z.string() }),
  ),
  replyInstructions: z.string().optional(),
  draft: z
    .object({
      text: z.string(),
      html: z.string(),
      confidence: z.string(),
      attachments: z.array(selectedAttachmentSchema).optional(),
    })
    .nullable(),
  sources: z.array(contextSourceSchema),
  missingInformation: z.array(z.string()),
  issues: z.array(contextIssueSchema),
  relatedResources: z.array(relatedResourceSchema),
});

export type EmailWorkspaceResult = z.infer<typeof emailWorkspaceResultSchema>;

/** Links are supplied by account-scoped collectors, never by model output. */
export function isSafeContextHref(href: string | null): href is string {
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) {
    return true;
  }
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}
