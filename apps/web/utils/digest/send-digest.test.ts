import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { sendDigest } from "./send-digest";
import {
  resolveSlackRouteDestination,
  sendDigestToSlack,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import { sendDigestEmail } from "@inboxzero/transactional-email";

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendDigestToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));
vi.mock("@inboxzero/transactional-email", () => ({
  sendDigestEmail: vi.fn(),
}));

const logger = createTestLogger();

const baseArgs = {
  emailAccountId: "email-account-1",
  userEmail: "user@example.com",
  unsubscribeToken: "token-123",
  date: new Date("2026-04-21T09:00:00Z"),
  ruleNames: { newsletters: "Newsletters" },
  itemsByRule: {
    newsletters: [{ from: "Acme", subject: "Hello", content: "body" }],
  },
  logger,
};

const slackChannel = {
  id: "channel-1",
  provider: MessagingProvider.SLACK,
  isConnected: true,
  accessToken: "xoxb-token",
  teamId: "team-1",
  providerUserId: "U1",
  routes: [
    {
      purpose: MessagingRoutePurpose.DIGESTS,
      targetType: MessagingRouteTargetType.CHANNEL,
      targetId: "C1",
    },
  ],
};

describe("sendDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveSlackRouteDestination as any).mockResolvedValue("C1");
  });

  it("sends email only when no channels are configured", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: true,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([]);

    await sendDigest(baseArgs);

    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendDigestToSlack).not.toHaveBeenCalled();
    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });
});
