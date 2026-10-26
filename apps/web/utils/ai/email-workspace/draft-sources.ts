import type { EmailForLLM } from "@/utils/types";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";
import type { ContextSource } from "./types";
import { sourcesForAccount } from "./context-sources";

type MeetingEvidence = {
  id?: string;
  title: string;
  excerpt: string;
  date: Date;
  href?: string;
};

/** Records the evidence actually supplied to this drafting run. */
export function buildDraftSources(input: {
  emailAccountId: string;
  messages: EmailForLLM[];
  knowledge: ContextSource[];
  memories: { id: string; content?: string; updatedAt?: string }[];
  history: ContextSource[];
  historicalSummary?: { messages: EmailForLLM[]; text: string | null };
  calendar: { text: string; messageId: string } | null;
  meetings: MeetingEvidence[];
  attachments: SelectedAttachment[];
  incomingAttachments?: ContextSource[];
  writingStyle: string | null;
}) {
  const { emailAccountId } = input;
  const sources: ContextSource[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const mailHref = (threadId?: string) =>
    threadId
      ? `/${encodeURIComponent(emailAccountId)}/mail?thread-id=${encodeURIComponent(threadId)}`
      : null;
  const add = (
    source: Omit<ContextSource, "emailAccountId" | "observedAt"> & {
      observedAt?: string;
    },
  ) => {
    if (seen.has(source.id)) return;
    seen.add(source.id);
    sources.push({
      ...source,
      emailAccountId,
      observedAt: source.observedAt ?? now,
    });
  };
  for (const message of input.messages) {
    add({
      id: `email:${message.id}`,
      type: "email",
      recordId: message.id,
      title: message.subject || "当前邮件",
      excerpt: message.content,
      observedAt: message.date?.toISOString(),
      href: mailHref(
        "threadId" in message ? String(message.threadId) : undefined,
      ),
    });
  }
  for (const source of sourcesForAccount(
    [...input.knowledge, ...input.history],
    emailAccountId,
  )) {
    add(source);
  }
  if (input.historicalSummary?.text) {
    for (const message of input.historicalSummary.messages) {
      add({
        id: `email:${message.id}`,
        type: "email",
        recordId: message.id,
        title: message.subject || "历史邮件",
        excerpt: message.content,
        observedAt: message.date?.toISOString(),
        href: mailHref(
          "threadId" in message ? String(message.threadId) : undefined,
        ),
      });
    }
  }
  for (const memory of input.memories) {
    if (!memory.content) continue;
    add({
      id: `reply_memory:${memory.id}`,
      type: "reply_memory",
      recordId: memory.id,
      title: "回复经验",
      excerpt: memory.content,
      observedAt: memory.updatedAt,
      href: `/${encodeURIComponent(emailAccountId)}/mail/source/reply-memory/${encodeURIComponent(memory.id)}`,
    });
  }
  if (input.calendar) {
    add({
      id: `calendar:${input.calendar.messageId}`,
      type: "calendar",
      recordId: `availability:${input.calendar.messageId}`,
      title: "日历可用时间查询",
      excerpt: input.calendar.text,
      href: `/${encodeURIComponent(emailAccountId)}/calendars`,
    });
  }
  for (const meeting of input.meetings) {
    if (!meeting.id) continue;
    add({
      id: `meeting:${meeting.id}`,
      type: "meeting",
      recordId: meeting.id,
      title: meeting.title,
      excerpt: meeting.excerpt,
      observedAt: meeting.date.toISOString(),
      href: meeting.href ?? `/${encodeURIComponent(emailAccountId)}/meetings`,
    });
  }
  for (const source of sourcesForAccount(
    input.incomingAttachments ?? [],
    emailAccountId,
  ))
    add(source);
  for (const attachment of input.attachments) {
    add({
      id: `attachment:${attachment.driveConnectionId}:${attachment.fileId}`,
      type: "attachment",
      recordId: attachment.fileId,
      title: attachment.filename,
      excerpt: attachment.sourceExcerpt ?? "仅文件名可用，未提取正文",
      href: `/${encodeURIComponent(emailAccountId)}/mail/source/attachment/${encodeURIComponent(attachment.fileId)}?connection=${encodeURIComponent(attachment.driveConnectionId)}`,
    });
  }
  if (input.writingStyle?.trim()) {
    add({
      id: `writing_style:${emailAccountId}`,
      type: "writing_style",
      recordId: emailAccountId,
      title: "写作偏好",
      excerpt: input.writingStyle,
      href: `/${encodeURIComponent(emailAccountId)}/automation?tab=settings`,
    });
  }
  return sources;
}
