import { z } from "zod";
export const filingPlanSchema = z.object({
  contentStatus: z.enum(["extracted", "metadata_only"]),
  driveName: z.string(),
  emailAccountId: z.string(),
  messageId: z.string(),
  attachmentId: z.string(),
  filename: z.string(),
  contentHash: z.string(),
  expiresAt: z.number(),
  action: z.enum(["use_existing", "create_new", "skip"]),
  driveConnectionId: z.string(),
  folderId: z.string(),
  folderPath: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  signature: z.string(),
});
