export type ImapAccountSummary = {
  id: string;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  archiveFolder: string;
};

export type ImapMessageSummary = {
  uid: number;
  subject: string;
  from: string;
  date: string | null;
  unread: boolean;
  size: number | null;
};

export type ImapInboxPage = {
  messages: ImapMessageSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImapAttachmentSummary = {
  filename: string;
  mimeType: string;
  size: number;
};

export type ImapMessageDetail = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string | null;
  text: string;
  html: string | null;
  attachments: ImapAttachmentSummary[];
};

export type QqCategory =
  | "action_required"
  | "information"
  | "marketing"
  | "manual_review";

export type QqMailMessageDto = {
  uid: number;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  receivedAt: string | null;
  unread: boolean;
  category: string | null;
  actionNeeded: boolean | null;
  aiSummary: string | null;
};

export type QqMailboxCounts = {
  action_required: number;
  information: number;
  marketing: number;
  manual_review: number;
  unclassified: number;
};

export type QqMailboxState = {
  total: number;
  counts: QqMailboxCounts;
  messages: QqMailMessageDto[];
};

export type QqMailboxSummary = {
  overview: string;
  todos: { title: string; deadline?: string; from?: string }[];
  important: { title: string; from?: string; why?: string }[];
  marketing: { from: string; note?: string }[];
};
