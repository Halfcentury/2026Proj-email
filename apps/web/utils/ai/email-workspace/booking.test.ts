import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { prepareBooking, manageBooking } from "./booking";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
const { create, reschedule, cancel } = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/utils/booking/public", () => ({
  createPublicBooking: create,
  reschedulePublicBooking: reschedule,
  cancelPublicBooking: cancel,
}));
const link = {
  id: "link",
  emailAccountId: "a",
  slug: "owned-link",
  durationMinutes: 30,
  destinationCalendarId: "calendar",
  destinationCalendar: {
    id: "calendar",
    name: "工作日历",
    connection: { isConnected: true },
  },
};
const input = {
  operation: "create" as const,
  bookingLinkId: "link",
  startTime: "2030-01-01T10:00:00Z",
  timezone: "UTC",
  guestName: "张三",
  guestEmail: "guest@example.com",
  threadId: "thread",
  messageId: "mail",
};
beforeEach(() => {
  vi.clearAllMocks();
  prisma.bookingLink.findFirst.mockResolvedValue(link as never);
  create.mockResolvedValue({
    id: "booking",
    status: "CONFIRMED",
    startTime: input.startTime,
    endTime: "2030-01-01T10:30:00Z",
  });
});
describe("reviewed bookings", () => {
  it("prepares without writes and confirms through the existing conflict-checked lifecycle", async () => {
    const plan = await prepareBooking({ emailAccountId: "a", input });
    expect(create).not.toHaveBeenCalled();
    await manageBooking({
      emailAccountId: "a",
      reviewToken: plan.reviewToken,
      logger: createTestLogger(),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          guestEmail: input.guestEmail,
          startTime: input.startTime,
        }),
        sourceContext: expect.objectContaining({
          emailAccountId: "a",
          threadId: "thread",
          messageId: "mail",
        }),
      }),
    );
  });
  it("rejects confirmation by a different mailbox", async () => {
    const plan = await prepareBooking({ emailAccountId: "a", input });
    await expect(
      manageBooking({
        emailAccountId: "b",
        reviewToken: plan.reviewToken,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("其他邮箱");
    expect(create).not.toHaveBeenCalled();
  });
  it("invalidates confirmation when the destination or duration changes", async () => {
    const plan = await prepareBooking({ emailAccountId: "a", input });
    prisma.bookingLink.findFirst.mockResolvedValue({
      ...link,
      durationMinutes: 60,
    } as never);
    await expect(
      manageBooking({
        emailAccountId: "a",
        reviewToken: plan.reviewToken,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("配置已变化");
    expect(create).not.toHaveBeenCalled();
  });
  it("surfaces a fresh provider conflict instead of claiming success", async () => {
    const plan = await prepareBooking({ emailAccountId: "a", input });
    create.mockRejectedValue(new Error("Selected slot is no longer available"));
    await expect(
      manageBooking({
        emailAccountId: "a",
        reviewToken: plan.reviewToken,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("no longer available");
  });
  it("rejects changed confirmation bytes", async () => {
    const plan = await prepareBooking({ emailAccountId: "a", input });
    await expect(
      manageBooking({
        emailAccountId: "a",
        reviewToken: `${plan.reviewToken}a`,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("确认内容无效");
    expect(create).not.toHaveBeenCalled();
  });
});
