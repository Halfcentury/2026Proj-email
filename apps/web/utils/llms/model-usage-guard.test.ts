import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertTrialAiUsageAllowed,
  shouldForceNanoModel,
} from "@/utils/llms/model-usage-guard";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { env } from "@/env";
import prisma from "@/utils/__mocks__/prisma";
import { redis } from "@/utils/redis";
import { sendActionRequiredEmail } from "@inboxzero/transactional-email";

vi.mock("@/utils/redis/usage", () => ({
  getWeeklyUsageCost: vi.fn(),
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@inboxzero/transactional-email", () => ({
  sendActionRequiredEmail: vi.fn(),
}));

vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: undefined,
    AI_TRIAL_WEEKLY_SPEND_LIMIT_USD: undefined,
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_FROM_EMAIL: "support@example.com",
    NANO_LLMS: undefined,
  },
}));

describe("shouldForceNanoModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = undefined;
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
    vi.mocked(env).NANO_LLMS = undefined;
  });

  it("does not force nano when the spend limit is not configured", async () => {
    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
      userId: "user-1",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("does not force nano for users with their own API key", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLMS = "openai:gpt-5.4-nano";

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: true,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("does not force nano when nano model is not configured", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
      userId: "user-1",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("forces nano when weekly spend meets the configured limit", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLMS = "openai:gpt-5.4-nano";
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3.25);

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
      userId: "user-1",
    });

    expect(result.shouldForce).toBe(true);
    expect(result.weeklySpendUsd).toBe(3.25);
    expect(result.weeklyLimitUsd).toBe(3);
  });

  it("does not force nano when weekly spend is below the limit", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLMS = "openai:gpt-5.4-nano";
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(2.99);

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
      userId: "user-1",
    });

    expect(result.shouldForce).toBe(false);
    expect(result.weeklySpendUsd).toBe(2.99);
    expect(result.weeklyLimitUsd).toBe(3);
  });
});

describe("assertTrialAiUsageAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
  });

  it("does nothing when trial spend limit is not configured", async () => {
    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not block users with their own API key", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;

    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: true,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not block paid subscriptions over the trial limit", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
      },
    } as any);

    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(sendActionRequiredEmail).not.toHaveBeenCalled();
  });
});

describe("getUserTrialAiUsageLimitStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
  });
});
