import { env } from "@/env";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { createScopedLogger } from "@/utils/logger";
const logger = createScopedLogger("llms/usage-budget");
export async function assertTrialAiUsageAllowed(..._args: unknown[]) {}
export async function shouldForceNanoModel(options: {
  userEmail: string;
  hasUserApiKey: boolean;
  label: string;
  userId?: string;
  emailAccountId?: string;
}): Promise<{
  shouldForce: boolean;
  weeklySpendUsd: number | null;
  weeklyLimitUsd: number | null;
}> {
  const weeklyLimitUsd = env.AI_NANO_WEEKLY_SPEND_LIMIT_USD;
  if (!weeklyLimitUsd)
    return {
      shouldForce: false,
      weeklySpendUsd: null,
      weeklyLimitUsd: null,
    };

  if (options.hasUserApiKey) {
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }

  if (!env.NANO_LLMS) {
    logger.warn("Nano model guard enabled but nano model is not configured", {
      label: options.label,
      userId: options.userId,
      emailAccountId: options.emailAccountId,
    });
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }
  if (!options.userId) {
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }

  try {
    const weeklySpendUsd = await getWeeklyUsageCost({
      userId: options.userId,
      legacyEmails: [options.userEmail],
    });
    return {
      shouldForce: weeklySpendUsd >= weeklyLimitUsd,
      weeklySpendUsd,
      weeklyLimitUsd,
    };
  } catch (error) {
    logger.error("Failed to evaluate nano model guard", {
      label: options.label,
      userId: options.userId,
      emailAccountId: options.emailAccountId,
      error,
    });
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }
}
