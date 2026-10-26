import type { ParsedMessage } from "@/utils/types";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { formatReplySubject } from "@/utils/email/subject";
export const prepareReplyingToEmail = (
  message: ParsedMessage,
  threadOn: ParsedMessage = message,
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    fromHint: getFromHint(message),
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : formatReplySubject(message.headers.subject),
    headerMessageId: threadOn.headers["message-id"] || undefined,
    messageId: threadOn.id || undefined,
    threadId: threadOn.threadId || undefined,
    // Keep original CC
    cc: message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: threadOn.headers.references,
    draftHtml: "",
    quotedContentHtml: html,
  };
};

// Follow-ups to the user's own mail keep its sender; replies to received mail
// go out from whichever of the user's addresses it was sent to.
export function getFromHint(message: ParsedMessage) {
  if (message.labelIds?.includes("SENT")) return message.headers.from;
  return [message.headers.to, message.headers.cc].filter(Boolean).join(", ");
}
