/** Provider key reserved for IMAP mailboxes stored in the Account table. */
export const IMAP_PROVIDER = "imap";

/** Folder that archived QQ messages are moved into (created on demand). */
export const DEFAULT_ARCHIVE_FOLDER = "已归档";

export const QQ_IMAP = {
  host: "imap.qq.com",
  port: 993,
  secure: true,
} as const;

export const IMAP_PAGE_SIZE = 20;
