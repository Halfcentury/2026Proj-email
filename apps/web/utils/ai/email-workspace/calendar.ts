import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { z } from "zod";
import { isValidTimeZone } from "@inboxzero/scheduling";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { Logger } from "@/utils/logger";

export const calendarQuerySchema = z
  .object({
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }),
    bookingLinkId: z.string().optional(),
    timezone: z.string().refine(isValidTimeZone, "请使用有效时区"),
    maxResults: z.number().int().min(1).max(100).default(25),
  })
  .refine(
    (input) =>
      new Date(input.endDate) > new Date(input.startDate) &&
      new Date(input.endDate).getTime() - new Date(input.startDate).getTime() <=
        93 * 86_400_000,
    "查询范围应在 93 天以内，结束时间必须晚于开始时间",
  );
export async function queryCalendar({
  emailAccountId,
  logger,
  ...input
}: { emailAccountId: string; logger: Logger } & z.input<
  typeof calendarQuerySchema
>) {
  const query = calendarQuerySchema.parse(input);
  const slots: { start: string; end: string }[] = [];
  let slotIssue: string | null = null;
  if (query.bookingLinkId) {
    const link = await prisma.bookingLink.findFirst({
      where: { id: query.bookingLinkId, emailAccountId, isActive: true },
      select: { slug: true },
    });
    if (!link) throw new SafeError("未找到此邮箱的预约类型。");
    try {
      const { getPublicAvailability } = await import("@/utils/booking/public");
      const available = await getPublicAvailability({
        slug: link.slug,
        start: new Date(query.startDate),
        end: new Date(query.endDate),
        logger,
        throwOnFailure: true,
      });
      slots.push(
        ...available.slice(0, 50).map((slot) => ({
          start: new Date(slot.startTime).toISOString(),
          end: new Date(slot.endTime).toISOString(),
        })),
      );
    } catch {
      slotIssue =
        "可预约时间查询失败，无法判断是否有空。请缩小查询范围并重试。";
    }
  }
  const observedAt = new Date().toISOString();
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  if (!providers.length)
    return {
      ...query,
      observedAt,
      status: "unavailable" as const,
      events: [],
      slots: [],
      slotStatus: "unavailable" as const,
      issues: ["尚未连接日历，无法判断是否有空。"],
    };
  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin: new Date(query.startDate),
        timeMax: new Date(query.endDate),
        maxResults: query.maxResults + 1,
      }),
    ),
  );
  const succeeded = results.filter((result) => result.status === "fulfilled");
  const events = succeeded
    .flatMap((result) => result.value)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const incomplete =
    succeeded.length !== providers.length ||
    succeeded.some((result) => result.value.length > query.maxResults);
  return {
    ...query,
    observedAt,
    slots,
    slotStatus: !query.bookingLinkId
      ? ("not_requested" as const)
      : slotIssue
        ? ("unavailable" as const)
        : ("completed" as const),
    status: !succeeded.length
      ? ("unavailable" as const)
      : incomplete
        ? ("partial" as const)
        : ("completed" as const),
    events: events.slice(0, query.maxResults).map((event) => ({
      ...event,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
    })),
    issues: [
      ...(slotIssue ? [slotIssue] : []),
      ...(!succeeded.length
        ? ["日历查询失败，无法判断是否有空。"]
        : incomplete
          ? ["部分日历查询失败或结果超出上限，当前列表不代表完整空闲情况。"]
          : []),
    ],
  };
}
