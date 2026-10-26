import { env } from "@/env";
import { sendDigestEmail } from "@inboxzero/transactional-email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

type DigestItem = { from: string; subject: string; content: string };
type ItemsByRule = Record<string, DigestItem[] | undefined>;

export async function sendDigest({
  emailAccountId,
  userEmail,
  unsubscribeToken,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  unsubscribeToken: string;
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}): Promise<void> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { digestSendEmail: true },
  });
  if (account?.digestSendEmail === false) {
    logger.info("Digest email delivery disabled");
    return;
  }
  await sendDigestViaEmail({
    emailAccountId,
    userEmail,
    unsubscribeToken,
    date,
    ruleNames,
    itemsByRule,
    logger,
  });
}

async function sendDigestViaEmail({
  emailAccountId,
  userEmail,
  unsubscribeToken,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  unsubscribeToken: string;
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}) {
  logger.info("Sending digest via email");
  await sendDigestEmail({
    from: env.RESEND_FROM_EMAIL,
    to: userEmail,
    emailProps: {
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      unsubscribeToken,
      date,
      ruleNames,
      ...itemsByRule,
      emailAccountId,
    },
  });
  logger.info("Digest email sent");
}
