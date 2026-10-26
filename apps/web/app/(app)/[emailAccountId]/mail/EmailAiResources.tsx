"use client";
import { getFilableAttachments } from "@/utils/drive/filable-attachments";
import { isValidTimeZone } from "@inboxzero/scheduling";
import Link from "next/link";
import { useId, useState } from "react";
import useSWR from "swr";
import { localDateTimeToIso } from "@/utils/calendar/local-date-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { ThreadMessage } from "@/components/email-list/types";
import {
  BookingReviewCard,
  CalendarQueryCard,
  FilingReviewCard,
  MeetingContextCard,
} from "@/components/assistant-chat/resource-result";
import {
  readWorkspaceAttachmentAction,
  suggestWorkspaceBookingAction,
  getWorkspaceResourcesAction,
  queryWorkspaceCalendarAction,
  getWorkspaceMeetingContextAction,
  suggestWorkspaceFilingAction,
  prepareWorkspaceBookingAction,
} from "@/utils/actions/email-workspace";
import type { BookingPlan } from "@/utils/ai/email-workspace/booking";
import type { AttachmentFilingPlan } from "@/utils/drive/filing-engine";
import { getActionErrorMessage } from "@/utils/error";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";

type CalendarResult = NonNullable<
  Awaited<ReturnType<typeof queryWorkspaceCalendarAction>>
>["data"];
type MeetingResult = NonNullable<
  Awaited<ReturnType<typeof getWorkspaceMeetingContextAction>>
>["data"];
export function useEmailAiResourceState({
  threadId,
  message,
}: {
  threadId: string;
  message: ThreadMessage;
}) {
  const { emailAccountId } = useAccount();
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [bookingInstructions, setBookingInstructions] = useState("");
  const [bookingMissing, setBookingMissing] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<CalendarResult>();
  const [meetings, setMeetings] = useState<MeetingResult>();
  const [readAttachment, setReadAttachment] =
    useState<
      NonNullable<
        Awaited<ReturnType<typeof readWorkspaceAttachmentAction>>
      >["data"]
    >();
  const [filing, setFiling] = useState<AttachmentFilingPlan>();
  const [booking, setBooking] = useState<BookingPlan>();
  const [linkId, setLinkId] = useState("");
  const [guestName, setGuestName] = useState(
    extractNameFromEmail(message.headers.from) || "",
  );
  const [guestEmail, setGuestEmail] = useState(
    extractEmailAddress(message.headers.from),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const {
    data: resources,
    mutate,
    error: resourcesError,
  } = useSWR(
    ["email-workspace-resources", emailAccountId, threadId],
    async () => {
      const response = await getWorkspaceResourcesAction(emailAccountId, {
        threadId,
      });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ?? "关联记录读取失败",
        );
      return response.data;
    },
  );
  async function run<T>(
    operation: () => Promise<{ data?: T; serverError?: string } | undefined>,
    save: (data: T) => void,
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await operation();
      if (!result?.data)
        throw new Error(
          getActionErrorMessage(result ?? {}) ?? "暂时无法完成，请重试。",
        );
      save(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "暂时无法完成，请重试。",
      );
    } finally {
      setPending(false);
    }
  }
  function prepare(
    operation: "create" | "reschedule" | "cancel",
    bookingId?: string,
  ) {
    setBooking(undefined);
    return run(
      () =>
        prepareWorkspaceBookingAction(emailAccountId, {
          threadId,
          messageId: message.id,
          operation,
          bookingId,
          bookingLinkId: linkId || resources?.links[0]?.id,
          timezone,
          guestName,
          guestEmail,
          startTime:
            operation === "cancel"
              ? undefined
              : localDateTimeToIso(start, timezone),
        }),
      setBooking,
    );
  }
  return {
    emailAccountId,
    timezone,
    setTimezone,
    start,
    setStart,
    end,
    setEnd,
    bookingInstructions,
    setBookingInstructions,
    bookingMissing,
    setBookingMissing,
    calendar,
    meetings,
    readAttachment,
    setReadAttachment,
    filing,
    booking,
    setBooking,
    linkId,
    setLinkId,
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    pending,
    error,
    resources,
    resourcesError,
    mutate,
    run,
    prepare,
    setCalendar,
    setMeetings,
    setFiling,
  };
}
export function EmailAiResources({
  state,
  threadId,
  message,
}: {
  state: ReturnType<typeof useEmailAiResourceState>;
  threadId: string;
  message: ThreadMessage;
}) {
  const {
    emailAccountId,
    timezone,
    setTimezone,
    start,
    setStart,
    end,
    setEnd,
    bookingInstructions,
    setBookingInstructions,
    bookingMissing,
    setBookingMissing,
    calendar,
    meetings,
    readAttachment,
    setReadAttachment,
    filing,
    booking,
    setBooking,
    linkId,
    setLinkId,
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    pending,
    error,
    resources,
    resourcesError,
    mutate,
    run,
    prepare,
    setCalendar,
    setMeetings,
    setFiling,
  } = state;
  const fieldId = useId();
  const attachments = getFilableAttachments(message);
  const displayTimezone = isValidTimeZone(timezone) ? timezone : "UTC";
  return (
    <div className="space-y-5">
      {resourcesError && (
        <p role="alert" className="text-sm text-destructive">
          关联记录读取失败，请刷新后重试。
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!!resources?.operations.length && (
        <section className="space-y-2">
          <h4 className="font-medium text-sm">执行记录</h4>
          {resources.operations.map((item) => (
            <div key={item.id} className="rounded-md border p-3 text-xs">
              <p className="mb-1 font-medium">{item.summary ?? "邮件操作"}</p>
              <p>
                {new Date(item.completedAt).toLocaleString("zh-CN")} ·{" "}
                {item.issues.length ? "执行后需核对" : "已完成"}
              </p>
              {item.issues.map((issue) => (
                <p key={issue} className="mt-1 text-amber-700">
                  {issue}
                </p>
              ))}
            </div>
          ))}
        </section>
      )}
      <section id="workspace-calendar" className="space-y-3">
        <h4 className="font-medium text-sm">日历与预约</h4>
        <label
          htmlFor={`${fieldId}-instructions`}
          className="block space-y-1 text-xs"
        >
          预约要求
          <Input
            id={`${fieldId}-instructions`}
            disabled={pending}
            aria-label="预约要求"
            placeholder="例如：把这封邮件对应的预约改到周四下午三点"
            value={bookingInstructions}
            onChange={(e) => {
              setBookingInstructions(e.target.value);
              setBooking(undefined);
              setBookingMissing([]);
            }}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                suggestWorkspaceBookingAction(emailAccountId, {
                  threadId,
                  instructions: bookingInstructions,
                }),
              (result) => {
                setBooking(result.plan ?? undefined);
                setBookingMissing(result.missingInformation);
              },
            )
          }
        >
          根据邮件准备预约方案
        </Button>
        {bookingMissing.map((item) => (
          <p role="status" key={item} className="text-sm text-amber-700">
            待确认：{item}
          </p>
        ))}
        <label
          htmlFor={`${fieldId}-timezone`}
          className="block space-y-1 text-xs"
        >
          时区
          <Input
            id={`${fieldId}-timezone`}
            disabled={pending}
            aria-label="查询时区"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setBooking(undefined);
            }}
          />
        </label>
        <label htmlFor={`${fieldId}-start`} className="block space-y-1 text-xs">
          开始时间
          <Input
            id={`${fieldId}-start`}
            disabled={pending}
            aria-label="开始时间"
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setBooking(undefined);
            }}
          />
        </label>
        <label htmlFor={`${fieldId}-end`} className="block space-y-1 text-xs">
          结束时间（查询日历时使用）
          <Input
            id={`${fieldId}-end`}
            disabled={pending}
            aria-label="结束时间"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !start || !end}
          onClick={() =>
            run(
              () =>
                queryWorkspaceCalendarAction(emailAccountId, {
                  startDate: localDateTimeToIso(start, timezone),
                  endDate: localDateTimeToIso(end, timezone),
                  timezone,
                  maxResults: 25,
                  bookingLinkId: linkId || resources?.links[0]?.id,
                }),
              setCalendar,
            )
          }
        >
          查询这段时间
        </Button>
        {calendar && <CalendarQueryCard result={calendar} />}
        {resources?.links.length ? (
          <details>
            <summary className="cursor-pointer text-sm">
              从这封邮件安排预约
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block text-xs">
                预约类型
                <select
                  disabled={pending}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={linkId || resources.links[0].id}
                  onChange={(e) => {
                    setLinkId(e.target.value);
                    setBooking(undefined);
                  }}
                >
                  {resources.links.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.title} · {link.durationMinutes} 分钟 ·{" "}
                      {link.destinationCalendar?.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                htmlFor={`${fieldId}-guest-name`}
                className="block space-y-1 text-xs"
              >
                参与人姓名
                <Input
                  id={`${fieldId}-guest-name`}
                  disabled={pending}
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setBooking(undefined);
                  }}
                />
              </label>
              <label
                htmlFor={`${fieldId}-guest-email`}
                className="block space-y-1 text-xs"
              >
                参与人邮箱
                <Input
                  id={`${fieldId}-guest-email`}
                  disabled={pending}
                  type="email"
                  value={guestEmail}
                  onChange={(e) => {
                    setGuestEmail(e.target.value);
                    setBooking(undefined);
                  }}
                />
              </label>
              <Button
                size="sm"
                disabled={pending || !start || !guestName || !guestEmail}
                onClick={() => prepare("create")}
              >
                准备预约，查看后确认
              </Button>
            </div>
          </details>
        ) : (
          !resourcesError && (
            <p className="text-xs text-muted-foreground">
              在日历页面连接日历并配置预约链接后，可从这里准备预约。
            </p>
          )
        )}
        {resources?.bookings.map((item) => (
          <div
            key={item.id}
            className="space-y-2 rounded-md border p-3 text-sm"
          >
            <p>
              {item.guestName} ·{" "}
              {new Date(item.startTime).toLocaleString("zh-CN", {
                timeZone: displayTimezone,
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {{
                CONFIRMED: "已确认",
                CANCELED: "已取消",
                PENDING_PROVIDER_EVENT: "等待日历确认",
                FAILED: "未完成",
              }[item.status] ?? "待核对"}
            </p>
            {item.status === "CONFIRMED" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !start}
                  onClick={() => prepare("reschedule", item.id)}
                >
                  改到所选开始时间
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => prepare("cancel", item.id)}
                >
                  准备取消
                </Button>
              </div>
            )}
          </div>
        ))}
        {booking && (
          <BookingReviewCard
            key={booking.reviewToken}
            plan={booking}
            onComplete={() => {
              mutate().catch(() => {});
            }}
            disabled={booking.messageId !== message.id}
          />
        )}
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          刷新预约记录
        </Button>
      </section>
      <section id="workspace-meeting" className="space-y-3">
        <h4 className="font-medium text-sm">会议资料</h4>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                getWorkspaceMeetingContextAction(emailAccountId, { threadId }),
              setMeetings,
            )
          }
        >
          查找相关会议纪要
        </Button>
        {meetings && <MeetingContextCard result={meetings} />}{" "}
        {resources?.meetings.map((meeting) => (
          <div
            key={meeting.id}
            className="space-y-2 rounded-md border p-3 text-sm"
          >
            <Link
              className="font-medium underline"
              href={`/${emailAccountId}/meetings?meeting-id=${encodeURIComponent(meeting.id)}`}
            >
              {meeting.eventTitle}
            </Link>
            <p className="text-xs text-muted-foreground">
              {new Date(meeting.startTime).toLocaleString("zh-CN", {
                timeZone: displayTimezone,
              })}
            </p>
            {meeting.followUpDraftId && (
              <p className="text-xs">已有会后跟进草稿，可在会议详情中查看。</p>
            )}
          </div>
        ))}
      </section>
      <section id="workspace-attachment" className="space-y-3">
        <h4 className="font-medium text-sm">邮件附件归档</h4>
        {attachments.length ? (
          attachments.map((attachment) => (
            <div
              className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
              key={attachment.attachmentId}
            >
              <span className="min-w-0 truncate">{attachment.filename}</span>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        readWorkspaceAttachmentAction(emailAccountId, {
                          threadId,
                          messageId: message.id,
                          attachmentId: attachment.attachmentId,
                        }),
                      setReadAttachment,
                    )
                  }
                >
                  读取正文
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        suggestWorkspaceFilingAction(emailAccountId, {
                          threadId,
                          messageId: message.id,
                          attachmentId: attachment.attachmentId,
                        }),
                      setFiling,
                    )
                  }
                >
                  建议目录
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            这封邮件暂无可归档附件。
          </p>
        )}
        {readAttachment && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{readAttachment.filename}</p>
            {readAttachment.contentAvailable ? (
              <>
                <p className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
                  {readAttachment.content}
                </p>
                {readAttachment.truncated && (
                  <p className="text-xs text-amber-700">
                    正文较长，仅显示前 8000 字。
                  </p>
                )}
              </>
            ) : (
              <p>{readAttachment.message}</p>
            )}
          </div>
        )}
        {filing && (
          <FilingReviewCard
            key={filing.signature}
            plan={filing}
            threadId={threadId}
            disabled={filing.messageId !== message.id}
          />
        )}
      </section>
    </div>
  );
}
