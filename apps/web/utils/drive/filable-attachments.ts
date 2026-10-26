import type { ParsedMessage, Attachment } from "@/utils/types";
import { isCalendarInviteAttachment } from "@/utils/parse/calender-event";
/**
 * Get all filable attachments from a message.
 * All user attachment types are supported - text-extractable files (PDF, DOCX,
 * TXT) get full content analysis, while other types (images, spreadsheets,
 * etc.) are filed based on filename and email metadata. Inline email assets and
 * calendar invite artifacts are excluded because they are part of the message
 * itself rather than user documents.
 */
export function getFilableAttachments(message: ParsedMessage): Attachment[] {
  return (message.attachments || []).filter((attachment) => {
    const contentDispositionType = attachment.headers?.["content-disposition"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

    return (
      contentDispositionType !== "inline" &&
      !isCalendarInviteAttachment(attachment)
    );
  });
}
