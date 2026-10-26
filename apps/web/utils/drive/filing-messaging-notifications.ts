import type { Logger } from "@/utils/logger";

export async function sendFilingMessagingNotifications({
  emailAccountId,
  filingId,
  senderEmail,
  logger,
}: {
  emailAccountId: string;
  filingId: string;
  senderEmail?: string | null;
  logger: Logger;
}): Promise<void> {
  return;
}
