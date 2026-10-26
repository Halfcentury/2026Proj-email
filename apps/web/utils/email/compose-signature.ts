import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
export async function getComposeSignature({
  emailAccountId,
}: {
  emailAccountId: string;
  userId: string;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { signature: true },
  });
  if (!account) throw new SafeError("Email account not found");
  return { signatureHtml: account.signature ?? "", footerHtml: "" };
}
