import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  bookingPlanInputSchema,
  bookingStoredPlanSchema,
} from "./booking-schema";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import {
  createPublicBooking,
  cancelPublicBooking,
  reschedulePublicBooking,
} from "@/utils/booking/public";
import type { Logger } from "@/utils/logger";
import { sealReview, openReview } from "./review-token";

export type BookingPlan = z.infer<typeof bookingStoredPlanSchema> & {
  reviewToken: string;
};
export async function prepareBooking({
  emailAccountId,
  input,
}: {
  emailAccountId: string;
  input: z.input<typeof bookingPlanInputSchema>;
}): Promise<BookingPlan> {
  const parsed = bookingPlanInputSchema.parse(input);
  const existing =
    parsed.operation === "create"
      ? null
      : await prisma.booking.findFirst({
          where: { id: parsed.bookingId ?? "", emailAccountId },
          include: { bookingLink: true },
        });
  if (parsed.operation !== "create" && !existing)
    throw new SafeError("未找到此邮箱的预约。");
  const link = await prisma.bookingLink.findFirst({
    where: {
      id: existing?.bookingLinkId ?? parsed.bookingLinkId ?? "",
      emailAccountId,
      ...(parsed.operation === "cancel" ? {} : { isActive: true }),
    },
    include: { destinationCalendar: { include: { connection: true } } },
  });
  if (
    !link ||
    (parsed.operation !== "cancel" &&
      !link.destinationCalendar?.connection.isConnected)
  )
    throw new SafeError("请先在日历页面配置有效预约链接及目标日历。");
  const startTime =
    parsed.operation === "cancel"
      ? existing!.startTime.toISOString()
      : parsed.startTime;
  const guestName = existing?.guestName ?? parsed.guestName;
  const guestEmail = existing?.guestEmail ?? parsed.guestEmail;
  if (!startTime || !guestName || !guestEmail)
    throw new SafeError("请确认时间、时区和参与人后再准备预约。");
  if (new Date(startTime) <= new Date())
    throw new SafeError("请选择尚未开始的预约时间。");
  const plan = bookingStoredPlanSchema.parse({
    ...parsed,
    emailAccountId,
    aiRunId: randomUUID(),
    slug: link.slug,
    calendarId:
      link.destinationCalendar?.id ?? existing?.providerCalendarId ?? "",
    calendarName: link.destinationCalendar?.name ?? "原预约日历",
    startTime,
    endTime:
      parsed.operation === "cancel"
        ? existing!.endTime.toISOString()
        : new Date(
            new Date(startTime).getTime() + link.durationMinutes * 60_000,
          ).toISOString(),
    guestName,
    guestEmail,
    version: existing?.updatedAt.toISOString() ?? null,
  });
  return { ...plan, reviewToken: sealReview("email-booking", plan) };
}
export async function manageBooking({
  emailAccountId,
  reviewToken,
  logger,
}: {
  emailAccountId: string;
  reviewToken: string;
  logger: Logger;
}) {
  const plan = bookingStoredPlanSchema.parse(
    openReview("email-booking", reviewToken),
  );
  if (plan.emailAccountId !== emailAccountId)
    throw new SafeError("无法操作其他邮箱的预约。");
  const link = await prisma.bookingLink.findFirst({
    where: {
      emailAccountId,
      slug: plan.slug,
      ...(plan.operation === "cancel" ? {} : { isActive: true }),
    },
  });
  if (
    !link ||
    (plan.operation !== "cancel" &&
      (link.destinationCalendarId !== plan.calendarId ||
        new Date(plan.endTime).getTime() -
          new Date(plan.startTime).getTime() !==
          link.durationMinutes * 60_000))
  )
    throw new SafeError("预约配置已变化，请重新确认。");
  if (plan.operation !== "create") {
    const booking = await prisma.booking.findFirst({
      where: { id: plan.bookingId, emailAccountId },
    });
    if (!booking || booking.updatedAt.toISOString() !== plan.version)
      throw new SafeError("预约已变化，请刷新后重新确认。");
  }
  const result =
    plan.operation === "create"
      ? await createPublicBooking({
          input: {
            slug: plan.slug,
            startTime: plan.startTime,
            timezone: plan.timezone,
            guestName: plan.guestName,
            guestEmail: plan.guestEmail,
            idempotencyToken: `ai:${plan.aiRunId}`,
          },
          sourceContext: {
            emailAccountId,
            threadId: plan.threadId,
            messageId: plan.messageId,
            aiRunId: plan.aiRunId,
          },
          logger,
        })
      : plan.operation === "cancel"
        ? await cancelPublicBooking({
            id: plan.bookingId!,
            ownerEmailAccountId: emailAccountId,
            reason: plan.reason,
            logger,
          })
        : await reschedulePublicBooking({
            id: plan.bookingId!,
            ownerEmailAccountId: emailAccountId,
            startTime: plan.startTime,
            guestTimezone: plan.timezone,
            logger,
          });
  return {
    threadId: plan.threadId,
    summary: `${{ create: "创建预约", reschedule: "更改预约", cancel: "取消预约" }[plan.operation]}：${plan.guestName}`,
    id: result.id,
    status: result.status,
    startTime: result.startTime,
    endTime: result.endTime,
    href: `/${emailAccountId}/calendars`,
    issues:
      "providerCancellationPending" in result &&
      result.providerCancellationPending
        ? ["预约状态已取消，但日历取消未能确认。请到日历核对，避免重复操作。"]
        : [],
  };
}
