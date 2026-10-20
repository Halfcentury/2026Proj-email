import { ImapFlow } from "imapflow";
import PostalMime, { type Address, type Attachment } from "postal-mime";
import { convert } from "html-to-text";
import type { ImapCredentials } from "./account";
import type {
  ImapInboxPage,
  ImapMessageDetail,
  ImapMessageSummary,
} from "./types";

const OPERATION_TIMEOUT_MS = 25_000;
const ARCHIVE_FALLBACK_FOLDER = "Archive";
const MOVE_CHUNK_SIZE = 50;

function createClient(credentials: ImapCredentials) {
  return new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.email, pass: credentials.password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("IMAP 请求超时，请稍后重试"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Connect, run one operation, then always release the session. */
async function withClient<T>(
  credentials: ImapCredentials,
  run: (client: ImapFlow) => Promise<T>,
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<T> {
  const client = createClient(credentials);
  await client.connect();
  try {
    return await withTimeout(run(client), timeoutMs, () => {
      try {
        client.close();
      } catch {
        // already closed
      }
    });
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        // already closed
      }
    }
  }
}

function formatEnvelopeAddress(address?: { name?: string; address?: string }) {
  if (!address) return "";
  const email = address.address?.trim();
  const name = address.name?.trim();
  if (name && email) return `${name} <${email}>`;
  return email || name || "";
}

function formatPostalAddress(address?: Address) {
  if (!address) return "";
  if ("group" in address && address.group) return address.name ?? "";
  const email = address.address ?? "";
  const name = address.name ?? "";
  return name && email ? `${name} <${email}>` : email || name;
}

function attachmentSize(content: Attachment["content"]) {
  if (typeof content === "string") return Buffer.byteLength(content);
  return content.byteLength;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Verify the authorization code and IMAP reachability before saving it. */
export async function testImapConnection(credentials: ImapCredentials) {
  return withClient(credentials, async (client) => {
    const folders = await client.list();
    return folders.length;
  });
}

export async function listInboxPage(
  credentials: ImapCredentials,
  page: number,
  pageSize: number,
): Promise<ImapInboxPage> {
  const safePage = Math.max(1, Math.floor(page));

  return withClient(credentials, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      const end = Math.max(total - (safePage - 1) * pageSize, 0);
      const start = Math.max(end - pageSize + 1, 1);

      if (!total || end < 1) {
        return { messages: [], total, page: safePage, pageSize };
      }

      const messages: ImapMessageSummary[] = [];
      for await (const message of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
      })) {
        const date =
          message.internalDate instanceof Date
            ? message.internalDate
            : message.envelope?.date;

        messages.push({
          uid: message.uid,
          subject: message.envelope?.subject?.trim() || "(无主题)",
          from: formatEnvelopeAddress(message.envelope?.from?.[0]),
          date: date ? new Date(date).toISOString() : null,
          unread: !message.flags?.has("\\Seen"),
          size: message.size ?? null,
        });
      }

      // IMAP sequence numbers grow towards newer mail; present newest first.
      messages.reverse();

      return { messages, total, page: safePage, pageSize };
    } finally {
      lock.release();
    }
  });
}

export async function getInboxMessage(
  credentials: ImapCredentials,
  uid: number,
): Promise<ImapMessageDetail> {
  return withClient(credentials, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const message = await client.fetchOne(
        uid,
        { uid: true, source: true, envelope: true, internalDate: true },
        { uid: true },
      );

      if (!message?.source) {
        throw new Error("邮件不存在或已被移动，请刷新列表");
      }

      const parsed = await PostalMime.parse(message.source);
      const date =
        message.internalDate instanceof Date
          ? message.internalDate
          : message.envelope?.date;

      await client
        .messageFlagsAdd(uid, ["\\Seen"], { uid: true })
        .catch(() => undefined);

      return {
        uid,
        subject:
          parsed.subject?.trim() ||
          message.envelope?.subject?.trim() ||
          "(无主题)",
        from: formatPostalAddress(parsed.from),
        to: (parsed.to ?? [])
          .map(formatPostalAddress)
          .filter(Boolean)
          .join(", "),
        cc: (parsed.cc ?? [])
          .map(formatPostalAddress)
          .filter(Boolean)
          .join(", "),
        date: date ? new Date(date).toISOString() : null,
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : null,
        attachments: (parsed.attachments ?? []).map((attachment) => ({
          filename: attachment.filename || "未命名附件",
          mimeType: attachment.mimeType || "application/octet-stream",
          size: attachmentSize(attachment.content),
        })),
      };
    } finally {
      lock.release();
    }
  });
}

/** Return the folder archived mail is moved into, creating it if needed. */
async function ensureArchiveFolder(client: ImapFlow, preferred: string) {
  const folders = await client.list();
  const existing =
    folders.find((folder) => folder.name === preferred) ??
    folders.find((folder) => folder.specialUse === "\\Archive");
  if (existing) return existing.path;

  try {
    const created = await client.mailboxCreate(preferred);
    return created.path;
  } catch {
    const created = await client.mailboxCreate(ARCHIVE_FALLBACK_FOLDER);
    return created.path;
  }
}

/** Move messages out of the inbox into the archive folder. */
export async function archiveMessages(
  credentials: ImapCredentials,
  uids: number[],
) {
  if (!uids.length) return 0;

  return withClient(credentials, async (client) => {
    const archivePath = await ensureArchiveFolder(
      client,
      credentials.archiveFolder,
    );
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (const group of chunk(uids, MOVE_CHUNK_SIZE)) {
        await client.messageMove(group.join(","), archivePath, { uid: true });
      }
      return uids.length;
    } finally {
      lock.release();
    }
  });
}

/** Archive every inbox message from one sender today. */
export async function archiveSender(
  credentials: ImapCredentials,
  from: string,
) {
  return withClient(credentials, async (client) => {
    const archivePath = await ensureArchiveFolder(
      client,
      credentials.archiveFolder,
    );
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from }, { uid: true });
      if (!uids?.length) return 0;

      for (const group of chunk(uids, MOVE_CHUNK_SIZE)) {
        await client.messageMove(group.join(","), archivePath, { uid: true });
      }
      return uids.length;
    } finally {
      lock.release();
    }
  });
}

export type FetchedInboxMessage = {
  uid: number;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  receivedAt: string | null;
  unread: boolean;
  text: string;
};

/** Pull the newest inbox messages with their decoded plain text for AI triage. */
export async function fetchInboxMessages(
  credentials: ImapCredentials,
  limit: number,
): Promise<FetchedInboxMessage[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 300);

  return withClient(
    credentials,
    async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (!total) return [];

        const start = Math.max(total - safeLimit + 1, 1);
        const messages: FetchedInboxMessage[] = [];

        for await (const message of client.fetch(`${start}:${total}`, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          source: true,
        })) {
          const from = message.envelope?.from?.[0];
          let text = "";

          if (message.source) {
            const parsed = await PostalMime.parse(message.source);
            text =
              parsed.text?.trim() ||
              (typeof parsed.html === "string"
                ? convert(parsed.html, { wordwrap: false })
                : "");
          }

          const date =
            message.internalDate instanceof Date
              ? message.internalDate
              : message.envelope?.date;

          messages.push({
            uid: message.uid,
            subject: message.envelope?.subject?.trim() || "(无主题)",
            fromAddress: from?.address?.trim() || "",
            fromName: from?.name?.trim() || null,
            receivedAt: date ? new Date(date).toISOString() : null,
            unread: !message.flags?.has("\\Seen"),
            text: text.slice(0, 20_000),
          });
        }

        messages.reverse();
        return messages;
      } finally {
        lock.release();
      }
    },
    180_000,
  );
}
