import { Prisma } from "@/generated/prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import type { DriveConnection } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage, Attachment } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { extractTextFromDocument } from "@/utils/drive/document-extraction";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  sendFiledNotification,
  sendAskNotification,
} from "@/utils/drive/filing-notifications";
import { sendFilingMessagingNotifications } from "@/utils/drive/filing-messaging-notifications";
import { extractEmailAddress } from "@/utils/email";
import { getFilableAttachments } from "@/utils/drive/filable-attachments";
export { getFilableAttachments };

// ============================================================================
// Types
// ============================================================================

export interface FilingResult {
  error?: string;
  filing?: {
    id: string;
    filename: string;
    folderPath: string;
    fileId: string | null;
    wasAsked: boolean;
    confidence: number | null;
    provider: string;
  };
  filingId?: string; // Available for both filed and skipped items (for feedback)
  skipped?: boolean;
  skipReason?: string;
  success: boolean;
}

export interface ProcessAttachmentOptions {
  attachment: Attachment;
  emailAccount: EmailAccountWithAI & {
    filingEnabled: boolean;
    filingPrompt: string | null;
    filingConfirmationSendEmail: boolean;
    email: string;
  };
  emailProvider: EmailProvider;
  logger: Logger;
  message: ParsedMessage;
  sendNotification?: boolean;
}

const DUPLICATE_FILING_FIELDS = ["emailAccountId", "messageId", "attachmentId"];
const PROCESSING_FILING_STALE_MS = 30 * 60 * 1000;

// ============================================================================
// Main Filing Engine
// ============================================================================

/**
 * Process a single attachment through the filing pipeline:
 * 1. Download attachment
 * 2. Extract text
 * 3. Fetch folders from all connected drives
 * 4. Analyze with AI
 * 5. Upload to drive
 * 6. Create DocumentFiling record
 */
export interface AttachmentFilingPlan {
  action: "use_existing" | "create_new" | "skip";
  attachmentId: string;
  confidence: number;
  contentHash: string;
  contentStatus: "extracted" | "metadata_only";
  driveConnectionId: string;
  driveName: string;
  emailAccountId: string;
  expiresAt: number;
  filename: string;
  folderId: string;
  folderPath: string;
  messageId: string;
  reasoning: string;
  signature: string;
}

function signFilingPlan(plan: Omit<AttachmentFilingPlan, "signature">) {
  return createHmac("sha256", env.EMAIL_ENCRYPT_SECRET)
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(plan).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex");
}

/** Read-only: downloads and analyzes, without claims, folders or uploads. */
export async function suggestAttachmentFiling({
  emailAccount,
  message,
  attachment,
  emailProvider,
  logger,
}: ProcessAttachmentOptions): Promise<AttachmentFilingPlan> {
  if (!emailAccount.filingPrompt) throw new Error("请先配置附件归档要求。");
  const [connections, savedFolders, data] = await Promise.all([
    prisma.driveConnection.findMany({
      where: { emailAccountId: emailAccount.id, isConnected: true },
    }),
    prisma.filingFolder.findMany({
      where: { emailAccountId: emailAccount.id },
      include: { driveConnection: true },
    }),
    emailProvider.getAttachment(message.id, attachment.attachmentId),
  ]);
  if (!connections.length) throw new Error("请先连接云盘。");
  const buffer = Buffer.from(data.data, "base64");
  const extraction = await extractTextFromDocument(
    buffer,
    attachment.mimeType,
    { logger },
  );
  const folders: FolderWithConnection[] = savedFolders
    .filter((f) => connections.some((c) => c.id === f.driveConnectionId))
    .map((f) => ({
      id: f.folderId,
      name: f.folderName,
      path: f.folderPath,
      driveConnectionId: f.driveConnectionId,
      driveProvider: f.driveConnection.provider,
    }));
  const analysis = await analyzeDocument({
    emailAccount: { ...emailAccount, filingPrompt: emailAccount.filingPrompt },
    email: {
      subject: message.headers.subject || message.subject,
      sender: message.headers.from,
    },
    attachment: {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      content: extraction?.text ?? "",
    },
    folders,
  });
  const target =
    analysis.action === "skip"
      ? { driveConnection: connections[0], folderId: "", folderPath: "" }
      : resolveFolderTarget(analysis, folders, connections, logger);
  const plan = {
    contentStatus: extraction?.text
      ? ("extracted" as const)
      : ("metadata_only" as const),
    driveName: `${target.driveConnection.provider === "google" ? "Google Drive" : "OneDrive"} · ${target.driveConnection.email}`,
    emailAccountId: emailAccount.id,
    messageId: message.id,
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    expiresAt: Date.now() + 30 * 60 * 1000,
    action: analysis.action,
    driveConnectionId: target.driveConnection.id,
    folderId: target.folderId,
    folderPath: target.folderPath,
    confidence: analysis.confidence,
    reasoning: analysis.reasoning,
  };
  return { ...plan, signature: signFilingPlan(plan) };
}

/** Rules keep the automatic flow; manual confirmation calls executeFiling. */
export async function processAttachment(
  options: ProcessAttachmentOptions,
): Promise<FilingResult> {
  try {
    if (
      !options.emailAccount.filingEnabled ||
      !options.emailAccount.filingPrompt
    )
      return { success: false, error: "Filing not enabled" };
    const existing = await findAttachmentFiling({
      emailAccountId: options.emailAccount.id,
      messageId: options.message.id,
      attachmentId: options.attachment.attachmentId,
    });
    if (existing && !isClaimableFiling(existing))
      return getExistingFilingResult(existing, options.logger);
    if (
      existing?.status === "PROCESSING" &&
      existing.updatedAt > new Date(Date.now() - PROCESSING_FILING_STALE_MS)
    )
      return {
        success: false,
        error: "Attachment is already being filed",
        filingId: existing.id,
      };
    const plan = await suggestAttachmentFiling(options);
    return executeFiling({ ...options, plan, confirmed: false });
  } catch (error) {
    options.logger.error("Unable to prepare filing", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "归档建议生成失败",
    };
  }
}

/** Uses exactly the reviewed plan. Never calls the model or changes its target. */
export async function executeFiling({
  emailAccount,
  message,
  attachment,
  emailProvider,
  logger,
  sendNotification = true,
  plan,
  confirmed,
}: ProcessAttachmentOptions & {
  plan: AttachmentFilingPlan;
  confirmed: boolean;
}): Promise<FilingResult> {
  const log = logger.with({
    action: "processAttachment",
    messageId: message.id,
    filename: attachment.filename,
  });
  let claimedFilingId: string | null = null;
  let uploadedFileId: string | null = null;

  try {
    const { signature, ...payload } = plan;
    const expected = Buffer.from(signFilingPlan(payload), "hex");
    const actual = Buffer.from(signature, "hex");
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected) ||
      plan.expiresAt < Date.now() ||
      plan.emailAccountId !== emailAccount.id ||
      plan.messageId !== message.id ||
      plan.attachmentId !== attachment.attachmentId ||
      plan.filename !== attachment.filename
    )
      throw new Error("归档建议已变化或过期，请重新获取建议。");
    // Validate filing is enabled with a prompt
    if (
      (!confirmed && !emailAccount.filingEnabled) ||
      !emailAccount.filingPrompt
    ) {
      log.info("Filing not enabled or no prompt configured");
      return { success: false, error: "Filing not enabled" };
    }

    const attachmentLookup = {
      emailAccountId: emailAccount.id,
      messageId: message.id,
      attachmentId: attachment.attachmentId,
    };

    const [existingFiling, driveConnections] = await Promise.all([
      findAttachmentFiling(attachmentLookup),
      prisma.driveConnection.findMany({
        where: {
          emailAccountId: emailAccount.id,
          isConnected: true,
        },
      }),
    ]);

    if (
      confirmed &&
      existingFiling?.status === "FILED" &&
      (existingFiling.folderPath !== plan.folderPath ||
        existingFiling.driveConnectionId !== plan.driveConnectionId)
    )
      throw new Error("附件已归档到其他位置，请在附件记录中确认并移动文件。");
    if (
      existingFiling &&
      !isClaimableFiling(existingFiling) &&
      !(confirmed && existingFiling.status === "PENDING")
    ) {
      return getExistingFilingResult(existingFiling, log);
    }

    // ERROR and stale PROCESSING claim the row, so wait until drives are
    // available; otherwise an early "no drives" return would leave the row
    // stuck in PROCESSING.
    if (driveConnections.length === 0) {
      log.info("No connected drives");
      return { success: false, error: "No connected drives" };
    }

    const claim = await claimAttachmentFiling({
      existingFiling,
      attachmentLookup,
      attachment,
      driveConnectionId: driveConnections[0].id,
      logger: log,
      confirmPending: confirmed,
    });
    if (claim.type === "return") return claim.result;
    claimedFilingId = claim.filingId;

    const attachmentData = await emailProvider.getAttachment(
      message.id,
      attachment.attachmentId,
    );
    const buffer = Buffer.from(attachmentData.data, "base64");
    if (createHash("sha256").update(buffer).digest("hex") !== plan.contentHash)
      throw new Error("附件内容已变化，请重新确认归档建议。");
    const analysis = plan;
    // Step 5: Handle skip action
    if (analysis.action === "skip") {
      log.info("AI decided to skip this document");

      const skipFilingData = {
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        folderPath: "",
        status: "PREVIEW" as const, // PREVIEW = AI decided to skip (not user rejection)
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        driveConnectionId: driveConnections[0].id,
        emailAccountId: emailAccount.id,
      };
      const skipFiling = await prisma.documentFiling.update({
        where: { id: claimedFilingId },
        data: skipFilingData,
      });

      log.info("Skip record created", { filingId: skipFiling.id });

      return {
        success: false,
        skipped: true,
        skipReason: analysis.reasoning,
        filingId: skipFiling.id,
      };
    }

    const driveConnection = driveConnections.find(
      (c) => c.id === plan.driveConnectionId,
    );
    if (!driveConnection) throw new Error("目标云盘已断开，请重新确认目录。");
    const folderId = plan.folderId;
    const folderPath = plan.folderPath;
    const needsToCreateFolder = plan.action === "create_new";
    if (plan.action === "use_existing") {
      const folder = (
        await prisma.filingFolder.findMany({
          where: {
            emailAccountId: emailAccount.id,
            driveConnectionId: plan.driveConnectionId,
            folderId: plan.folderId,
          },
        })
      ).find(
        (folder) =>
          folder.folderId === plan.folderId &&
          folder.driveConnectionId === plan.driveConnectionId,
      );
      if (!folder || folder.folderPath !== plan.folderPath)
        throw new Error("目标目录已变化，请重新确认。");
    }
    const shouldAsk = !confirmed && analysis.confidence < 0.7;
    // Step 6: Create folder if needed
    const driveProvider = await createDriveProviderWithRefresh(
      driveConnection,
      log,
    );
    let targetFolderId = folderId;
    let targetFolderPath = folderPath;

    const previousAttempt = existingFiling?.uploadAttempt as
      | {
          folderId: string;
          contentHash: string;
          filename: string;
        }
      | null
      | undefined;
    if (
      previousAttempt &&
      (previousAttempt.contentHash !== plan.contentHash ||
        existingFiling?.driveConnectionId !== driveConnection.id ||
        existingFiling.folderPath !== folderPath)
    )
      throw new Error(
        "上次云盘上传结果待核对，请先核对原目录，勿改到其他位置重复上传。",
      );
    if (previousAttempt) targetFolderId = previousAttempt.folderId;
    if (!previousAttempt && !shouldAsk && needsToCreateFolder && folderPath) {
      log.info("Creating new folder", { path: folderPath });
      const newFolder = await createAndSaveFilingFolder({
        driveProvider,
        folderPath,
        emailAccountId: emailAccount.id,
        driveConnectionId: driveConnection.id,
        logger: log,
      });
      targetFolderId = newFolder.id;
      targetFolderPath = folderPath;
    }

    // Step 7: Determine if we should ask the user first

    // Step 8: Upload file (unless low confidence - then we ask first)
    let fileId: string | null = null;
    if (!shouldAsk) {
      log.info("Uploading file to drive", {
        folderId: targetFolderId,
        folderPath: targetFolderPath,
      });
      if (previousAttempt) {
        const { reconcileUploadedAttachment } = await import(
          "@/utils/drive/upload-recovery"
        );
        fileId = await reconcileUploadedAttachment(driveProvider, {
          ...previousAttempt,
          fileId: existingFiling?.fileId ?? undefined,
        });
      } else {
        // Persist BEFORE issuing the request, including process crashes/timeouts.
        await prisma.documentFiling.update({
          where: { id: claimedFilingId },
          data: {
            folderId: targetFolderId,
            folderPath: targetFolderPath,
            driveConnectionId: driveConnection.id,
            uploadAttempt: {
              folderId: targetFolderId,
              contentHash: plan.contentHash,
              filename: attachment.filename,
              attemptedAt: new Date().toISOString(),
            },
          },
        });
        const uploadedFile = await driveProvider.uploadFile({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          content: buffer,
          folderId: targetFolderId,
        });
        fileId = uploadedFile.id;
        uploadedFileId = uploadedFile.id;
      }
    }

    // Step 9: Create or replace DocumentFiling record
    const filingData = {
      messageId: message.id,
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      folderId: targetFolderId,
      folderPath: targetFolderPath,
      fileId,
      uploadAttempt: shouldAsk ? undefined : Prisma.DbNull,
      reasoning: analysis.reasoning,
      confidence: analysis.confidence,
      status: shouldAsk ? ("PENDING" as const) : ("FILED" as const),
      wasAsked: shouldAsk,
      driveConnectionId: driveConnection.id,
      emailAccountId: emailAccount.id,
    };
    const filing = await prisma.documentFiling.update({
      where: { id: claimedFilingId },
      data: filingData,
    });

    log.info("Filing record created", {
      filingId: filing.id,
      status: filing.status,
      wasAsked: shouldAsk,
    });

    const shouldSendAskNotification = sendNotification && shouldAsk;
    const shouldSendFiledNotification =
      sendNotification &&
      !shouldAsk &&
      emailAccount.filingConfirmationSendEmail;

    // Step 10: Send notification email as a reply to the source email
    if (shouldSendAskNotification || shouldSendFiledNotification) {
      const sourceMessage = {
        threadId: message.threadId,
        headerMessageId: message.headers["message-id"] || "",
        references: message.headers.references,
        messageId: message.id,
      };

      try {
        if (shouldSendAskNotification) {
          await sendAskNotification({
            emailProvider,
            userEmail: emailAccount.email,
            filingId: filing.id,
            sourceMessage,
            logger: log,
          });
        } else {
          await sendFiledNotification({
            emailProvider,
            userEmail: emailAccount.email,
            filingId: filing.id,
            sourceMessage,
            logger: log,
          });
        }
      } catch (notificationError) {
        // Don't fail the filing if notification fails
        log.error("Failed to send notification", { error: notificationError });
      }
    }

    try {
      await sendFilingMessagingNotifications({
        emailAccountId: emailAccount.id,
        filingId: filing.id,
        senderEmail: extractEmailAddress(message.headers.from),
        logger: log,
      });
    } catch (messagingError) {
      log.error("Failed to send messaging notification", {
        error: messagingError,
      });
    }

    return {
      success: true,
      filing: {
        id: filing.id,
        filename: attachment.filename,
        folderPath: targetFolderPath,
        fileId,
        wasAsked: shouldAsk,
        confidence: analysis.confidence,
        provider: driveConnection.provider,
      },
    };
  } catch (error) {
    if (claimedFilingId) {
      try {
        await prisma.documentFiling.update({
          where: { id: claimedFilingId },
          data: {
            status: "ERROR",
            ...(uploadedFileId ? { fileId: uploadedFileId } : {}),
            reasoning: error instanceof Error ? error.message : "Unknown error",
          },
        });
      } catch (cleanupError) {
        log.error("Failed to mark filing as errored", { error: cleanupError });
      }
    }

    log.error("Error processing attachment", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

interface FolderWithConnection {
  driveConnectionId: string;
  driveProvider: string;
  id: string;
  name: string;
  path: string;
}

interface FolderTarget {
  driveConnection: DriveConnection;
  folderId: string;
  folderPath: string;
  needsToCreateFolder: boolean;
}

type AttachmentFiling = NonNullable<
  Awaited<ReturnType<typeof findAttachmentFiling>>
>;

type ExistingFilingDecision =
  | { type: "retry"; filingId: string }
  | { type: "return"; result: FilingResult };

type AttachmentLookup = {
  emailAccountId: string;
  messageId: string;
  attachmentId: string;
};

function findAttachmentFiling({
  emailAccountId,
  messageId,
  attachmentId,
}: AttachmentLookup) {
  return prisma.documentFiling.findFirst({
    where: {
      emailAccountId,
      messageId,
      attachmentId,
    },
    select: {
      id: true,
      filename: true,
      driveConnectionId: true,
      folderPath: true,
      fileId: true,
      uploadAttempt: true,
      status: true,
      updatedAt: true,
      wasAsked: true,
      confidence: true,
      reasoning: true,
      driveConnection: {
        select: {
          provider: true,
        },
      },
    },
  });
}

async function claimAttachmentFiling({
  existingFiling,
  attachmentLookup,
  attachment,
  driveConnectionId,
  logger,
  confirmPending = false,
}: {
  confirmPending?: boolean;
  existingFiling: AttachmentFiling | null;
  attachmentLookup: AttachmentLookup;
  attachment: Attachment;
  driveConnectionId: string;
  logger: Logger;
}): Promise<ExistingFilingDecision> {
  if (existingFiling) {
    return claimOrResolveExistingFiling(existingFiling, logger, confirmPending);
  }

  try {
    const processingFiling = await prisma.documentFiling.create({
      data: {
        ...attachmentLookup,
        filename: attachment.filename,
        folderPath: "",
        status: "PROCESSING",
        driveConnectionId,
      },
    });
    return { type: "retry", filingId: processingFiling.id };
  } catch (claimError) {
    if (!isDuplicateError(claimError, DUPLICATE_FILING_FIELDS)) {
      throw claimError;
    }

    const claimedFiling = await findAttachmentFiling(attachmentLookup);
    if (!claimedFiling) throw claimError;

    logger.info("Attachment was claimed by another filing process", {
      filingId: claimedFiling.id,
      status: claimedFiling.status,
    });

    return claimOrResolveExistingFiling(claimedFiling, logger, confirmPending);
  }
}

async function claimOrResolveExistingFiling(
  filing: AttachmentFiling,
  logger: Logger,
  confirmPending = false,
): Promise<ExistingFilingDecision> {
  logger.info("Attachment already has a filing record", {
    filingId: filing.id,
    status: filing.status,
  });

  if (
    filing.status === "ERROR" ||
    (confirmPending && filing.status === "PENDING")
  ) {
    const claim = await prisma.documentFiling.updateMany({
      where: {
        id: filing.id,
        status: filing.status,
      },
      data: {
        status: "PROCESSING",
        reasoning: null,
        updatedAt: new Date(),
      },
    });

    if (claim.count === 1) {
      logger.info("Retrying attachment after previous filing error", {
        filingId: filing.id,
      });
      return { type: "retry", filingId: filing.id };
    }

    return alreadyProcessing(filing.id);
  }

  if (filing.status === "PREVIEW") {
    return { type: "return", result: getExistingFilingResult(filing) };
  }

  if (filing.status === "PROCESSING") {
    const staleCutoff = new Date(Date.now() - PROCESSING_FILING_STALE_MS);

    if (filing.updatedAt <= staleCutoff) {
      const claim = await prisma.documentFiling.updateMany({
        where: {
          id: filing.id,
          status: "PROCESSING",
          updatedAt: { lte: staleCutoff },
        },
        data: {
          reasoning: null,
          updatedAt: new Date(),
        },
      });

      if (claim.count === 1) {
        logger.info("Retrying stale attachment filing claim", {
          filingId: filing.id,
        });
        return { type: "retry", filingId: filing.id };
      }
    }

    return alreadyProcessing(filing.id);
  }

  return { type: "return", result: getExistingFilingResult(filing) };
}

function alreadyProcessing(filingId: string): ExistingFilingDecision {
  return {
    type: "return",
    result: {
      success: false,
      error: "Attachment is already being filed",
      filingId,
    },
  };
}

function isClaimableFiling(filing: AttachmentFiling) {
  return filing.status === "ERROR" || filing.status === "PROCESSING";
}

function getExistingFilingResult(
  filing: AttachmentFiling,
  logger?: Logger,
): FilingResult {
  logger?.info("Attachment already has a filing record", {
    filingId: filing.id,
    status: filing.status,
  });

  if (filing.status === "PREVIEW") {
    return {
      success: false,
      skipped: true,
      skipReason:
        filing.reasoning || "Document doesn't match filing preferences",
      filingId: filing.id,
    };
  }

  return {
    success: true,
    filing: {
      id: filing.id,
      filename: filing.filename,
      folderPath: filing.folderPath,
      fileId: filing.fileId,
      wasAsked: filing.wasAsked,
      confidence: filing.confidence,
      provider: filing.driveConnection.provider,
    },
    filingId: filing.id,
  };
}

function resolveFolderTarget(
  analysis: {
    action: string;
    folderId?: string | null;
    folderPath?: string | null;
  },
  folders: FolderWithConnection[],
  connections: DriveConnection[],
  logger: Logger,
): FolderTarget {
  if (analysis.action === "use_existing" && analysis.folderId) {
    // Find the folder in our list
    const folder = folders.find((f) => f.id === analysis.folderId);
    if (folder) {
      const connection = connections.find(
        (c) => c.id === folder.driveConnectionId,
      );
      if (connection) {
        return {
          driveConnection: connection,
          folderId: folder.id,
          folderPath: folder.path || folder.name,
          needsToCreateFolder: false,
        };
      }
    }
    throw new Error("建议目录已失效，请重新选择目录。");
  }

  // Creating new folder - use first connection
  const connection = connections[0];
  return {
    driveConnection: connection,
    folderId: "root",
    folderPath: analysis.folderPath || "十组邮件小助手 Filed",
    needsToCreateFolder: true,
  };
}

/** Approving an existing low-confidence notification uses its saved target. */
export async function confirmPendingFiling({
  emailAccountId,
  filingId,
  emailProvider,
  logger,
}: {
  emailAccountId: string;
  filingId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<FilingResult> {
  const [filing, account] = await Promise.all([
    prisma.documentFiling.findFirst({
      where: { id: filingId, emailAccountId },
      include: { driveConnection: true },
    }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: { user: true, account: true },
    }),
  ]);
  if (!filing || !account) throw new Error("归档记录不存在。");
  if (filing.status === "FILED") return { success: true, filingId: filing.id };
  if (filing.status !== "PENDING")
    throw new Error("归档状态已变化，请刷新后重试。");
  const message = await emailProvider.getMessage(filing.messageId);
  const attachment = getFilableAttachments(message).find(
    (item) =>
      item.attachmentId === filing.attachmentId &&
      item.filename === filing.filename,
  );
  if (!attachment) throw new Error("原附件已变化，请重新获取建议。");
  const data = await emailProvider.getAttachment(
    message.id,
    attachment.attachmentId,
  );
  const payload: Omit<AttachmentFilingPlan, "signature"> = {
    emailAccountId,
    messageId: message.id,
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    contentHash: createHash("sha256")
      .update(Buffer.from(data.data, "base64"))
      .digest("hex"),
    expiresAt: Date.now() + 30 * 60 * 1000,
    action:
      filing.folderId && filing.folderId !== "root"
        ? "use_existing"
        : "create_new",
    driveConnectionId: filing.driveConnectionId,
    driveName: `${filing.driveConnection.provider === "google" ? "Google Drive" : "OneDrive"} · ${filing.driveConnection.email}`,
    folderId: filing.folderId || "root",
    folderPath: filing.folderPath,
    confidence: filing.confidence ?? 0,
    reasoning: filing.reasoning ?? "用户确认原归档建议",
    contentStatus: "metadata_only",
  };
  const result = await executeFiling({
    emailAccount: account,
    emailProvider,
    message,
    attachment,
    logger,
    sendNotification: false,
    plan: { ...payload, signature: signFilingPlan(payload) },
    confirmed: true,
  });
  if (!result.success)
    throw new Error(result.error ?? "归档未完成，请核对已有文件后重试。");
  await prisma.documentFiling.update({
    where: { id: filingId, emailAccountId },
    data: { feedbackPositive: true, feedbackAt: new Date() },
  });
  return result;
}
