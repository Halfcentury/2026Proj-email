import { randomUUID } from "node:crypto";
import prisma from "@/utils/prisma";
import { decryptToken, encryptToken } from "@/utils/encryption";
import { DEFAULT_ARCHIVE_FOLDER, IMAP_PROVIDER, QQ_IMAP } from "./config";
import type { ImapAccountSummary } from "./types";

type StoredConfig = {
  host: string;
  port: number;
  secure: boolean;
  archiveFolder: string;
};

export type ImapCredentials = ImapAccountSummary & { password: string };

/**
 * IMAP settings ride along in `Account.scope`; the authorization code is
 * encrypted in `Account.access_token`. No EmailAccount row is created, so the
 * Gmail/Outlook-only mail UI never tries to use this connection.
 */
function parseStoredConfig(scope: string | null): StoredConfig {
  if (scope) {
    try {
      const parsed = JSON.parse(scope) as Partial<StoredConfig>;
      if (parsed.host && parsed.port) {
        return {
          host: parsed.host,
          port: parsed.port,
          secure: parsed.secure ?? true,
          archiveFolder: parsed.archiveFolder ?? DEFAULT_ARCHIVE_FOLDER,
        };
      }
    } catch {
      // Fall through to the default QQ configuration.
    }
  }
  return { ...QQ_IMAP, archiveFolder: DEFAULT_ARCHIVE_FOLDER };
}

export async function listImapAccounts(
  userId: string,
): Promise<ImapAccountSummary[]> {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: IMAP_PROVIDER },
    orderBy: { createdAt: "asc" },
    select: { id: true, providerAccountId: true, scope: true },
  });

  return accounts.map((account) => ({
    id: account.id,
    email: account.providerAccountId,
    ...parseStoredConfig(account.scope),
  }));
}

export async function getImapAccountSummary(
  userId: string,
  accountId: string,
): Promise<ImapAccountSummary> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, provider: IMAP_PROVIDER },
    select: { id: true, providerAccountId: true, scope: true },
  });
  if (!account) throw new Error("找不到该邮箱，请重新连接");
  return {
    id: account.id,
    email: account.providerAccountId,
    ...parseStoredConfig(account.scope),
  };
}

export async function getImapCredentials(
  userId: string,
  accountId: string,
): Promise<ImapCredentials> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, provider: IMAP_PROVIDER },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      scope: true,
    },
  });

  if (!account) throw new Error("找不到该邮箱，请重新连接");
  const password = decryptToken(account.access_token);
  if (!password) throw new Error("邮箱凭据无效，请重新连接");

  return {
    id: account.id,
    email: account.providerAccountId,
    password,
    ...parseStoredConfig(account.scope),
  };
}

export async function saveImapAccount({
  userId,
  email,
  authCode,
}: {
  userId: string;
  email: string;
  authCode: string;
}) {
  const encrypted = encryptToken(authCode);
  if (!encrypted) throw new Error("无法保存授权码，请重试");

  const existing = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: IMAP_PROVIDER,
        providerAccountId: email,
      },
    },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new Error("该邮箱已被其他账户连接");
  }

  const scope = JSON.stringify({
    ...QQ_IMAP,
    archiveFolder: DEFAULT_ARCHIVE_FOLDER,
  } satisfies StoredConfig);

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: IMAP_PROVIDER,
        providerAccountId: email,
      },
    },
    create: {
      id: randomUUID(),
      userId,
      provider: IMAP_PROVIDER,
      type: "imap",
      providerAccountId: email,
      access_token: encrypted,
      token_type: "imap-auth-code",
      scope,
    },
    update: {
      userId,
      access_token: encrypted,
      token_type: "imap-auth-code",
      scope,
      disconnectedAt: null,
    },
  });
}

export async function deleteImapAccount(userId: string, accountId: string) {
  await prisma.account.deleteMany({
    where: { id: accountId, userId, provider: IMAP_PROVIDER },
  });
}
