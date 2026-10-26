import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";
import type { Logger } from "@/utils/logger";
import { sendComposeDraft } from "@/utils/email/compose-draft";
import { stripSentMessageOpenPixels } from "@/utils/email/legacy-open-pixels";
export async function sendHtmlEmail({
  emailProvider,
  email,
}: {
  emailProvider: EmailProvider;
  email: SendEmailBody;
  emailAccountId: string;
  threadId?: string | null;
  logger: Logger;
}) {
  const prepared = {
    ...email,
    messageHtml: stripSentMessageOpenPixels(email.messageHtml),
  };
  return email.providerDraftId
    ? sendComposeDraft({
        draftId: email.providerDraftId,
        provider: emailProvider,
        email: prepared,
      })
    : emailProvider.sendEmailWithHtml(prepared);
}
