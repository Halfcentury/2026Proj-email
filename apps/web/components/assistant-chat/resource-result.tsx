"use client";
import { formatInUserTimezone } from "@/utils/date";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  getWorkspaceOperationStatusAction,
  confirmWorkspaceBookingAction,
  executeWorkspaceFilingAction,
  confirmWorkspaceRecordingAction,
} from "@/utils/actions/email-workspace";
import { getActionErrorMessage } from "@/utils/error";
import { filingPlanSchema } from "@/utils/drive/filing-plan-schema";
import type { RecordingPlan } from "@/utils/ai/email-workspace/recording";
import type { BookingPlan } from "@/utils/ai/email-workspace/booking";
import type { AttachmentFilingPlan } from "@/utils/drive/filing-engine";
import type { queryCalendar } from "@/utils/ai/email-workspace/calendar";
import type { getMeetingContext } from "@/utils/ai/email-workspace/resources";

function useOperationReceipt(token: string) {
  const { emailAccountId } = useAccount();
  return useSWR(["workspace-operation", emailAccountId, token], async () => {
    const response = await getWorkspaceOperationStatusAction(emailAccountId, {
      token,
    });
    if (!response?.data) throw new Error("无法核对执行记录，请刷新后重试。");
    return response.data.receipt;
  });
}

export function BookingReviewCard({
  plan,
  disabled = false,
  onComplete,
}: {
  plan: BookingPlan;
  disabled?: boolean;
  onComplete?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const receipt = useOperationReceipt(plan.reviewToken);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function confirm() {
    setPending(true);
    setError("");
    try {
      const response = await confirmWorkspaceBookingAction(emailAccountId, {
        reviewToken: plan.reviewToken,
      });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ?? "操作失败，请重试。",
        );
      setIssues(response.data.issues ?? []);
      setDone(true);
      onComplete?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setPending(false);
    }
  }
  const completed = done || Boolean(receipt.data);
  const displayedIssues = [
    ...new Set([...issues, ...(receipt.data?.issues ?? [])]),
  ];
  const format = (time: string) =>
    formatInUserTimezone(new Date(time), plan.timezone, "yyyy-MM-dd HH:mm xxx");
  return (
    <Card>
      <CardHeader className="p-3 font-medium text-sm">
        {plan.operation === "create"
          ? "确认创建预约"
          : plan.operation === "reschedule"
            ? "确认更改预约"
            : "确认取消预约"}
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 text-sm">
        <p>
          {plan.guestName} · {plan.guestEmail}
        </p>
        <p>
          {format(plan.startTime)} — {format(plan.endTime)}
          <br />
          <span className="text-muted-foreground">{plan.timezone}</span>
        </p>
        <p>目标日历：{plan.calendarName}</p>
        {plan.reason && <p>{plan.reason}</p>}
        <p className="text-xs text-muted-foreground">
          {plan.operation === "cancel"
            ? "确认后会取消此预约并通知参与人。"
            : "确认后会重新检查冲突，再更新日历并通知参与人。"}
        </p>
        {displayedIssues.map((issue) => (
          <div role="alert" key={issue} className="space-y-2 text-amber-700">
            <p>{issue}</p>
            <Link className="underline" href={`/${emailAccountId}/calendars`}>
              打开日历核对
            </Link>
          </div>
        ))}
        {receipt.error && (
          <p role="alert" className="text-destructive">
            无法核对执行记录，请刷新后重试。
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button
          size="sm"
          disabled={
            disabled ||
            pending ||
            completed ||
            receipt.isLoading ||
            Boolean(receipt.error)
          }
          onClick={confirm}
        >
          {completed
            ? displayedIssues.length
              ? "请核对日历"
              : "已完成"
            : pending
              ? "正在处理…"
              : "确认执行"}
        </Button>
      </CardContent>
    </Card>
  );
}
export function FilingReviewCard({
  plan,
  threadId,
  disabled = false,
}: {
  plan: AttachmentFilingPlan;
  threadId: string;
  disabled?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const receipt = useOperationReceipt(plan.signature);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function confirm() {
    setPending(true);
    setError("");
    try {
      const response = await executeWorkspaceFilingAction(emailAccountId, {
        threadId,
        plan,
      });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ??
            "归档失败，请核对已有文件后重试。",
        );
      setIssues(response.data.issues ?? []);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "归档失败");
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader className="p-3 text-sm font-medium">
        {plan.filename}
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 text-sm">
        <p>
          {plan.action === "skip" ? "建议跳过" : `目标目录：${plan.folderPath}`}
        </p>
        <p className="break-all text-xs text-muted-foreground">
          {plan.driveName}
        </p>
        <p className="text-muted-foreground">{plan.reasoning}</p>
        {plan.contentStatus === "metadata_only" && (
          <p className="text-xs text-amber-700">
            未提取附件正文，本次建议仅参考文件名和邮件信息。
          </p>
        )}
        {plan.action === "create_new" && (
          <p className="text-xs">确认后将创建此目录并上传附件。</p>
        )}
        {[...new Set([...issues, ...(receipt.data?.issues ?? [])])].map(
          (issue) => (
            <p role="alert" className="text-amber-700" key={issue}>
              {issue}
            </p>
          ),
        )}
        {receipt.error && (
          <p role="alert" className="text-destructive">
            无法核对执行记录，请刷新后重试。
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {plan.action !== "skip" && (
          <Button
            size="sm"
            disabled={
              disabled ||
              pending ||
              done ||
              Boolean(receipt.data) ||
              receipt.isLoading ||
              Boolean(receipt.error)
            }
            onClick={confirm}
          >
            {done || receipt.data
              ? "已归档"
              : pending
                ? "正在归档…"
                : "确认归档到此目录"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
export function CalendarQueryCard({
  result,
}: {
  result: Awaited<ReturnType<typeof queryCalendar>>;
}) {
  const format = (time: string) =>
    new Date(time).toLocaleString("zh-CN", { timeZone: result.timezone });
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <p className="font-medium">日历查询</p>
      <p className="text-xs text-muted-foreground">
        {format(result.startDate)} — {format(result.endDate)} ·{" "}
        {result.timezone}
      </p>
      {result.issues.map((issue) => (
        <p className="text-amber-700" key={issue}>
          {issue}
        </p>
      ))}
      {result.slotStatus === "completed" && (
        <div className="space-y-2">
          <p className="font-medium">符合预约规则的可选时间</p>
          {result.slots?.length ? (
            result.slots.map((slot) => (
              <p key={slot.start} className="text-xs">
                {format(slot.start)} — {format(slot.end)}
              </p>
            ))
          ) : (
            <p>此范围没有可预约时间。</p>
          )}
        </div>
      )}
      {result.events.map((event) => (
        <div key={event.id} className="border-t pt-2">
          <p>{event.title}</p>
          <p className="text-xs text-muted-foreground">
            {format(event.startTime)} — {format(event.endTime)}
          </p>
        </div>
      ))}
      {result.status === "completed" && !result.events.length && (
        <p>此范围未查到日历事件；预约提交时仍会重新检查冲突。</p>
      )}
    </div>
  );
}
export function MeetingContextCard({
  result,
}: {
  result: Awaited<ReturnType<typeof getMeetingContext>>;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <p className="font-medium">适用的会议资料</p>
      {result.issues.map((issue) => (
        <p key={issue} className="text-amber-700">
          {issue}
        </p>
      ))}
      {!result.meetings.length && !result.issues.length && (
        <p className="text-muted-foreground">
          暂无所有邮件参与人都出席的会议纪要。
        </p>
      )}
      {result.meetings.map((meeting) => (
        <div key={meeting.id} className="space-y-2 border-t pt-2">
          <Link className="font-medium underline" href={meeting.href}>
            {meeting.eventTitle}
          </Link>
          <p>{meeting.summary.overview}</p>
          {meeting.summary.actionItems.map((item, index) => (
            <p className="text-muted-foreground" key={index}>
              {item.description}
              {item.owner ? ` · ${item.owner}` : ""}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
export function RecordingReviewCard({
  plan,
  disabled = false,
}: {
  plan: RecordingPlan;
  disabled?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const receipt = useOperationReceipt(plan.reviewToken);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function confirm() {
    setPending(true);
    setError("");
    try {
      const response = await confirmWorkspaceRecordingAction(emailAccountId, {
        reviewToken: plan.reviewToken,
      });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ?? "修改失败，请重试。",
        );
      setIssues(response.data.issues ?? []);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改失败");
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader className="p-3 font-medium text-sm">{plan.title}</CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 text-sm">
        {plan.enabled !== undefined && (
          <p>
            {plan.enabled
              ? "启用此邮箱的会议记录功能。"
              : "停用此邮箱的会议记录，并释放已安排的记录任务。"}
          </p>
        )}
        {plan.calendarEventId && (
          <p>
            {plan.join ? "为这场会议安排记录。" : "停止为这场会议安排记录。"}
          </p>
        )}
        {[...new Set([...issues, ...(receipt.data?.issues ?? [])])].map(
          (issue) => (
            <p role="alert" className="text-amber-700" key={issue}>
              {issue}
            </p>
          ),
        )}
        {receipt.error && (
          <p role="alert" className="text-destructive">
            无法核对执行记录，请刷新后重试。
          </p>
        )}
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button
          size="sm"
          disabled={
            disabled ||
            pending ||
            done ||
            Boolean(receipt.data) ||
            receipt.isLoading ||
            Boolean(receipt.error)
          }
          onClick={confirm}
        >
          {done || receipt.data ? "已完成" : pending ? "正在处理…" : "确认修改"}
        </Button>
      </CardContent>
    </Card>
  );
}
export function ResourceToolResult({
  type,
  output,
  threadId,
  disabled,
}: {
  type: string;
  output: unknown;
  threadId?: string;
  disabled: boolean;
}) {
  if (!output || typeof output !== "object") return null;
  if (type === "tool-getEmailWorkspaceResources")
    return (
      <WorkspaceResourcesCard
        result={
          output as Awaited<
            ReturnType<
              typeof import("@/utils/ai/email-workspace/workspace-resources").getWorkspaceResources
            >
          >
        }
      />
    );
  if (type === "tool-configureMeetingRecording")
    return (
      <RecordingReviewCard plan={output as RecordingPlan} disabled={disabled} />
    );
  if (type === "tool-manageBooking")
    return (
      <BookingReviewCard plan={output as BookingPlan} disabled={disabled} />
    );
  if (type === "tool-suggestAttachmentFiling") {
    const parsed = filingPlanSchema.safeParse(output);
    return parsed.success && threadId ? (
      <FilingReviewCard
        plan={parsed.data}
        threadId={threadId}
        disabled={disabled}
      />
    ) : null;
  }
  if (type === "tool-getCalendarEvents")
    return (
      <CalendarQueryCard
        result={output as Awaited<ReturnType<typeof queryCalendar>>}
      />
    );
  if (type === "tool-getMeetingContext")
    return (
      <MeetingContextCard
        result={output as Awaited<ReturnType<typeof getMeetingContext>>}
      />
    );
  return null;
}

function WorkspaceResourcesCard({
  result,
}: {
  result: Awaited<
    ReturnType<
      typeof import("@/utils/ai/email-workspace/workspace-resources").getWorkspaceResources
    >
  >;
}) {
  const { emailAccountId } = useAccount();
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <p className="font-medium">此邮件的日程与会议</p>
      {result.bookings.map((booking) => (
        <div key={booking.id} className="space-y-1 border-t pt-2">
          <p>
            {booking.guestName} · {booking.guestEmail}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(booking.startTime).toLocaleString("zh-CN", {
              timeZone: result.timezone,
            })}{" "}
            · {result.timezone} ·{" "}
            {booking.status === "CONFIRMED"
              ? "已确认"
              : booking.status === "CANCELED"
                ? "已取消"
                : "待核对"}
          </p>
        </div>
      ))}
      {!result.bookings.length && (
        <p className="text-muted-foreground">此邮件暂无关联预约。</p>
      )}
      {result.links.map((link) => (
        <Link
          key={link.id}
          className="block underline"
          href={`/book/${encodeURIComponent(link.slug)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.title} · {link.durationMinutes} 分钟
        </Link>
      ))}
      {result.meetings.map((meeting) => (
        <Link
          key={meeting.id}
          className="block underline"
          href={`/${emailAccountId}/meetings?meeting-id=${encodeURIComponent(meeting.id)}`}
        >
          {meeting.eventTitle}
        </Link>
      ))}
    </div>
  );
}
