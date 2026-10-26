import prisma from "@/utils/__mocks__/prisma";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queryCalendar } from "./calendar";
import { createTestLogger } from "@/__tests__/helpers";
const { providers, availability } = vi.hoisted(() => ({
  providers: vi.fn(),
  availability: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/booking/public", () => ({
  getPublicAvailability: availability,
}));
vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProviders: providers,
}));
const input = {
  emailAccountId: "a",
  logger: createTestLogger(),
  startDate: "2026-11-01T00:00:00Z",
  endDate: "2026-11-02T00:00:00Z",
  timezone: "UTC",
};
beforeEach(() => vi.clearAllMocks());
describe("calendar uncertainty", () => {
  it("does not report a disconnected calendar as free", async () => {
    providers.mockResolvedValue([]);
    const result = await queryCalendar(input);
    expect(result.status).toBe("unavailable");
    expect(result.issues[0]).toContain("无法判断");
  });
  it("keeps partial failures visible alongside actual event IDs", async () => {
    providers.mockResolvedValue([
      { fetchEvents: vi.fn().mockRejectedValue(new Error("offline")) },
      {
        fetchEvents: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            title: "会议",
            startTime: new Date(input.startDate),
            endTime: new Date(input.endDate),
            attendees: [],
          },
        ]),
      },
    ]);
    const result = await queryCalendar(input);
    expect(result.status).toBe("partial");
    expect(result.events[0].id).toBe("event-1");
    expect(result.issues).not.toHaveLength(0);
  });
  it("rejects a reversed range before calling providers", async () => {
    await expect(
      queryCalendar({ ...input, endDate: input.startDate }),
    ).rejects.toThrow();
    expect(providers).not.toHaveBeenCalled();
  });
});

describe("booking policy availability", () => {
  it("uses the owned booking policy and never labels a failed query as no slots", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      slug: "owned-link",
    } as any);
    providers.mockResolvedValue([
      { fetchEvents: vi.fn().mockResolvedValue([]) },
    ]);
    availability.mockRejectedValue(new Error("provider offline"));
    const result = await queryCalendar({ ...input, bookingLinkId: "owned" });
    expect(result.slotStatus).toBe("unavailable");
    expect(result.issues.join()).toContain("无法判断");
    expect(availability).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "owned-link", throwOnFailure: true }),
    );
  });
  it("returns only slots produced by the existing booking policy", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      slug: "owned-link",
    } as any);
    providers.mockResolvedValue([
      { fetchEvents: vi.fn().mockResolvedValue([]) },
    ]);
    availability.mockResolvedValue([
      { startTime: input.startDate, endTime: input.endDate },
    ]);
    const result = await queryCalendar({ ...input, bookingLinkId: "owned" });
    expect(result.slotStatus).toBe("completed");
    expect(result.slots[0]).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-11-02T00:00:00.000Z",
    });
  });
});
