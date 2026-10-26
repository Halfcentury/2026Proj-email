import type { PremiumTier } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// These fields only read legacy data. Subscription processors and sales rules are removed.
export const premiumEntitlementSelect = {
  appleExpiresAt: true,
  appleRevokedAt: true,
  appleSubscriptionStatus: true,
  adminGrantExpiresAt: true,
  adminGrantTier: true,
  lemonSqueezyRenewsAt: true,
  stripeSubscriptionStatus: true,
  tier: true,
} as const;
export const isPremium = (..._args: unknown[]) => true;
export const isPremiumRecord = (..._args: unknown[]) => true;
export const isActivePremium = (..._args: unknown[]) => true;
export const hasAiAccess = (..._args: unknown[]) => true;
export const hasUnsubscribeAccess = (..._args: unknown[]) => true;
export const hasTierAccess = (..._args: unknown[]) => true;
export const isOnHigherTier = (..._args: unknown[]) => true;
export const hasActiveAppleSubscription = (..._args: unknown[]) => false;
export const getUserTier = (..._args: unknown[]): PremiumTier =>
  "PROFESSIONAL_ANNUALLY";
export const getPremiumUserFilter = (
  ..._args: unknown[]
): Prisma.EmailAccountWhereInput => ({});
export const getRemainingUnsubscribeCredits = (..._args: unknown[]) =>
  Number.MAX_SAFE_INTEGER;
export const getUnsubscribePeriod = (now = new Date()) =>
  now.getFullYear() * 100 + now.getMonth() + 1;
export const RERUN_MINIMUM_TIER: PremiumTier = "PROFESSIONAL_MONTHLY";
export const RERUN_UPGRADE_MESSAGE = "暂时无法重新处理邮件，请稍后重试。";
export async function checkHasAccess(..._args: unknown[]) {
  return true;
}
export async function assertCanUseDigests(..._args: unknown[]) {}
export async function assertCanUseDigestsIfNeeded(..._args: unknown[]) {}
import { ActionType } from "@/generated/prisma/enums";

export function hasDigestAction(
  actions: { type: ActionType }[] | undefined,
): boolean {
  return !!actions?.some((action) => action.type === ActionType.DIGEST);
}

export function isAddingDigestAction({
  requestedActions,
  existingActions,
}: {
  requestedActions: { type: ActionType }[];
  existingActions?: { type: ActionType }[];
}): boolean {
  return hasDigestAction(requestedActions) && !hasDigestAction(existingActions);
}

export function shouldIncludeDigestAction({
  digestFeatureEnabled,
  hasDigestAccess,
  wantsDigest,
  hasExistingDigest,
}: {
  digestFeatureEnabled: boolean;
  hasDigestAccess: boolean;
  wantsDigest: boolean;
  hasExistingDigest: boolean;
}): boolean {
  if (!digestFeatureEnabled) return hasExistingDigest;
  if (hasDigestAccess) return wantsDigest;
  return wantsDigest && hasExistingDigest;
}
