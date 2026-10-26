import type {
  MessagingProvider as Provider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
export type MessagingPlatform = "slack" | "teams" | "telegram";
export type MessagingProvider = "SLACK" | "TEAMS" | "TELEGRAM";
export const getMessagingProviderName = (..._args: unknown[]) =>
  "已移除的通知渠道";
export const getConnectAppLabel = (..._args: unknown[]) => "此渠道已移除";
export type MessagingRouteSummary = {
  enabled: boolean;
  targetId: string | null;
  targetLabel: string | null;
  isDm: boolean;
};
export type MessagingChannelDestinations = Record<
  | "ruleNotifications"
  | "scheduledCheckIns"
  | "meetingBriefs"
  | "documentFilings"
  | "digests"
  | "followUps",
  MessagingRouteSummary
>;
export type LegacyMessagingChannel = {
  id: string;
  provider: Provider;
  teamName: string | null;
  teamId: string | null;
  isConnected: boolean;
  canSendAsDm: boolean;
  destinations: MessagingChannelDestinations;
  actions: Array<{
    id: string;
    type: string;
    ruleId: string | null;
    rule: { id: string; name: string } | null;
  }>;
};
export type GetMessagingChannelsResponse = {
  channels: LegacyMessagingChannel[];
  availableProviders: Provider[];
};
export type GetChannelTargetsResponse = {
  targets: Array<{ id: string; name: string }>;
};
export function getMessagingRoute<T extends { purpose: MessagingRoutePurpose }>(
  routes: T[] | undefined | null,
  ..._args: unknown[]
): T | null {
  return null;
}
export const hasMessagingRoute = (..._args: unknown[]) => false;
export const getMessagingRouteWhere = (..._args: unknown[]) => ({
  id: { in: [] as string[] },
});
export const formatRouteTargetLabel = (..._args: unknown[]) => null;
export const getConnectedRuleNotificationChannels = <
  T = LegacyMessagingChannel,
>(
  ..._args: unknown[]
): T[] => [];
export const isMessagingChannelOperational = (..._args: unknown[]) => false;
export const SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS: Provider[] = [];
export const DEFAULT_AUTOMATION_JOB_CRON = "0 9 * * *";
