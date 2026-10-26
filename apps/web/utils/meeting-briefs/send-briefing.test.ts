import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { sendBriefing } from "./send-briefing";
import { sendNotificationEmail } from "@/utils/email/send-notification-email";
import { createTestLogger } from "@/__tests__/helpers";
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/send-notification-email", () => ({
  sendNotificationEmail: vi.fn(),
}));
vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn(async () => "unsubscribe-token"),
}));
const input = {
  event: {
    id: "event-1",
    title: "Review",
    startTime: new Date("2026-10-25T10:00:00Z"),
    endTime: new Date("2026-10-25T11:00:00Z"),
    videoConferenceLink: null,
    eventUrl: null,
  },
  briefingContent: { priorities: [], guests: [] },
  internalTeamMembers: [],
  emailAccountId: "account",
  userEmail: "user@example.com",
  provider: "google",
  userTimezone: null,
  logger: createTestLogger(),
} as Parameters<typeof sendBriefing>[0];
describe("meeting briefing email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      meetingBriefsSendEmail: true,
    } as never);
  });
  it("delivers the brief using the existing email notification helper", async () => {
    await sendBriefing(input);
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account",
        userEmail: "user@example.com",
        provider: "google",
        renderHtml: expect.any(Function),
        sendViaResend: expect.any(Function),
      }),
    );
  });
  it("respects the account's email delivery setting", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      meetingBriefsSendEmail: false,
    } as never);
    await sendBriefing(input);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});
