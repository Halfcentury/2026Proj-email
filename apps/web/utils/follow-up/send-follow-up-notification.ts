import type {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
  ThreadTrackerType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { truncateSnippet } from "@/utils/follow-up/copy";
import type { FollowUpNotificationDelivery } from "@/utils/follow-up/notification-deliveries";

const TELEGRAM_SNIPPET_MAX_CHARS = 3000;

export type FollowUpNotificationChannel = {
  id: string;
  provider: MessagingProvider;
  isConnected: boolean;
  accessToken: string | null;
  teamId: string | null;
  providerUserId: string | null;
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetType: MessagingRouteTargetType;
    targetId: string;
  }>;
};

type FollowUpNotificationContent = {
  subject: string;
  counterpartyName: string;
  counterpartyEmail: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  snippet?: string;
  threadLink?: string;
  threadLinkLabel?: string;
  trackerId: string;
};

export async function getFollowUpNotificationChannels(
  emailAccountId: string,
): Promise<FollowUpNotificationChannel[]> {
  return [];
}

export async function sendFollowUpNotification({
  channels,
  logger,
  ...content
}: FollowUpNotificationContent & {
  channels: FollowUpNotificationChannel[];
  logger: Logger;
}): Promise<FollowUpNotificationDelivery[]> {
  return [];
}

function formatQuotedSnippet(snippet: string, maxChars?: number): string {
  return truncateSnippet(snippet, maxChars)
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}
