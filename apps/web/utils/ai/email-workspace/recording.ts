import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { recordingInputSchema } from "./recording-schema";
import { getWorkspaceMessage, type ResourceOptions } from "./resources";
import { sealReview, openReview } from "./review-token";
import { SafeError, assertActionSucceeded } from "@/utils/error";
import {
  setMeetingJoinOverrideAction,
  updateMeetingRecorderSettingsAction,
} from "@/utils/actions/meeting-recorder";
const planSchema = recordingInputSchema.and(
  z.object({
    emailAccountId: z.string(),
    title: z.string(),
    currentEnabled: z.boolean(),
  }),
);
export type RecordingPlan = z.infer<typeof planSchema> & {
  reviewToken: string;
};
export async function prepareMeetingRecording(
  options: ResourceOptions,
  input: z.input<typeof recordingInputSchema>,
): Promise<RecordingPlan> {
  const parsed = recordingInputSchema.parse(input);
  await getWorkspaceMessage(options, parsed.threadId, parsed.messageId);
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: options.emailAccountId },
    select: { meetingRecorderEnabled: true },
  });
  let title = "会议记录设置";
  if (parsed.calendarEventId) {
    const meeting = await prisma.meeting.findFirst({
      where: {
        emailAccountId: options.emailAccountId,
        calendarEventId: parsed.calendarEventId,
      },
      select: { eventTitle: true },
    });
    title = meeting?.eventTitle ?? "所选日历会议";
  }
  const plan = {
    ...parsed,
    emailAccountId: options.emailAccountId,
    title,
    currentEnabled: account.meetingRecorderEnabled,
  };
  return { ...plan, reviewToken: sealReview("email-recording", plan) };
}
export async function configureMeetingRecording(
  emailAccountId: string,
  reviewToken: string,
) {
  const plan = planSchema.parse(openReview("email-recording", reviewToken));
  if (plan.emailAccountId !== emailAccountId)
    throw new SafeError("无法修改其他邮箱的会议设置。");
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: { meetingRecorderEnabled: true },
  });
  if (account.meetingRecorderEnabled !== plan.currentEnabled)
    throw new SafeError("会议记录设置已变化，请重新确认。");
  if (plan.enabled !== undefined) {
    const response = await updateMeetingRecorderSettingsAction(emailAccountId, {
      enabled: plan.enabled,
    });
    assertActionSucceeded(response);
  }
  if (plan.calendarEventId && plan.join !== undefined) {
    const response = await setMeetingJoinOverrideAction(emailAccountId, {
      calendarEventId: plan.calendarEventId,
      join: plan.join,
    });
    assertActionSucceeded(response);
    await prisma.meeting.updateMany({
      where: {
        emailAccountId,
        calendarEventId: plan.calendarEventId,
        sourceContext: { equals: Prisma.DbNull },
      },
      data: {
        sourceContext: {
          emailAccountId,
          threadId: plan.threadId,
          messageId: plan.messageId,
        },
      },
    });
  }
  return {
    threadId: plan.threadId,
    summary:
      plan.enabled !== undefined
        ? plan.enabled
          ? "启用邮箱会议记录"
          : "停用邮箱会议记录"
        : `${plan.join ? "安排" : "停止"}会议记录：${plan.title}`,
    success: true,
    href: `/${emailAccountId}/meetings`,
  };
}
