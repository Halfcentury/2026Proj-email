import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import type {
  ContextIssue,
  ContextSource,
} from "@/utils/ai/email-workspace/types";
import { getFilableAttachments } from "@/utils/drive/filable-attachments";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 8000;
const MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/html",
]);

/** Metadata comes from the owned provider message, never from model hints. */
export async function readEmailAttachment({
  emailProvider,
  message,
  attachmentId,
  logger,
}: {
  emailProvider: EmailProvider;
  message: ParsedMessage;
  attachmentId: string;
  logger: Logger;
}) {
  const item = message.attachments?.find(
    (a) => a.attachmentId === attachmentId,
  );
  if (!item) throw new Error("未找到此邮件的附件。");
  const metadata = {
    filename: item.filename,
    mimeType: item.mimeType,
    size: item.size,
  };
  if (!MIME_TYPES.has(item.mimeType) || item.size > MAX_BYTES)
    return {
      ...metadata,
      contentAvailable: false as const,
      message: "此附件类型暂不支持正文提取，或超过 10 MB 限制。",
    };
  const attachment = await emailProvider.getAttachment(
    message.id,
    attachmentId,
  );
  const buffer = Buffer.from(attachment.data, "base64");
  if (buffer.length > MAX_BYTES) throw new Error("附件超过 10 MB 读取限制。");
  let text: string;
  let truncated = false;
  if (item.mimeType === "text/csv") text = buffer.toString("utf-8");
  else if (item.mimeType === "text/html") {
    const { htmlToText } = await import("html-to-text");
    text = htmlToText(buffer.toString("utf-8"), {
      wordwrap: false,
      selectors: [{ selector: "img", format: "skip" }],
    });
  } else {
    const { extractTextFromDocument } = await import(
      "@/utils/drive/document-extraction"
    );
    const result = await extractTextFromDocument(buffer, item.mimeType, {
      maxLength: MAX_TEXT,
      logger,
    });
    text = result?.text ?? "";
    truncated = result?.truncated ?? false;
  }
  truncated ||= text.length > MAX_TEXT;
  text = text.slice(0, MAX_TEXT);
  if (!text.trim())
    return {
      ...metadata,
      contentAvailable: false as const,
      message: "未能提取附件正文，请打开原附件核对。",
    };
  return {
    ...metadata,
    contentAvailable: true as const,
    content: text,
    truncated,
  };
}

export async function collectIncomingAttachmentContext({
  emailAccountId,
  emailProvider,
  message,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  message: ParsedMessage;
  logger: Logger;
}) {
  const sources: ContextSource[] = [];
  const issues: ContextIssue[] = [];
  const items = getFilableAttachments(message);
  // Bound total prompt/download size; never silently treat excluded files as read.
  if (items.length > 4)
    issues.push({
      source: "来信附件",
      message: "本次仅读取前 4 个附件，其余附件请单独打开核对。",
    });
  for (const item of items.slice(0, 4)) {
    try {
      const read = await readEmailAttachment({
        emailProvider,
        message,
        attachmentId: item.attachmentId,
        logger,
      });
      if (!read.contentAvailable) {
        issues.push({
          source: "来信附件",
          message: `${item.filename}：${read.message}`,
        });
        continue;
      }
      if (read.truncated)
        issues.push({
          source: "来信附件",
          message: `${item.filename}：正文较长，仅参考前 ${MAX_TEXT} 字，请核对完整文件。`,
        });
      sources.push({
        id: `incoming_attachment:${message.id}:${item.attachmentId}`,
        type: "attachment",
        recordId: item.attachmentId,
        emailAccountId,
        title: item.filename,
        excerpt: read.content,
        observedAt: new Date().toISOString(),
        href: `/${encodeURIComponent(emailAccountId)}/mail?thread-id=${encodeURIComponent(message.threadId)}&attachment-id=${encodeURIComponent(item.attachmentId)}`,
      });
    } catch (error) {
      logger.warn("Incoming attachment unavailable", {
        error,
        messageId: message.id,
      });
      issues.push({
        source: "来信附件",
        message: `${item.filename}：读取失败，回复未参考该附件正文。`,
      });
    }
  }
  return {
    sources,
    issues,
    content: sources.length
      ? sources.map((s) => `附件：${s.title}\n${s.excerpt}`).join("\n\n")
      : null,
  };
}
