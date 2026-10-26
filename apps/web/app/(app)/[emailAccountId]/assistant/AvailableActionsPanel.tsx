import { ActionType } from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/utils/retired-notifications";
import { Card, CardContent } from "@/components/ui/card";
import { ACTION_TYPE_LABELS, getActionIcon } from "@/utils/action-display";
import { SectionHeader } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import {
  getAvailableActions,
  getExtraActions,
} from "@/utils/ai/rule/create-rule-schema";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { getMessagingProviderName } from "@/utils/retired-notifications";
import { getConnectedRuleNotificationChannels } from "@/utils/retired-notifications";
import { useIntegrationActionsEnabled } from "@/hooks/useFeatureFlags";

const actionTooltips: Partial<Record<ActionType, string>> = {
  [ActionType.CALL_WEBHOOK]: "向指定网址发送邮件数据以触发 Webhook",
  [ActionType.DIGEST]: "汇总邮件并以每日摘要的形式发送",
};

export function AvailableActionsPanel() {
  const { emailAccountId, provider } = useAccount();
  const integrationActionsEnabled = useIntegrationActionsEnabled();
  const { data: messagingChannelsData } = useMessagingChannels(emailAccountId);
  const notifyActionName = getNotifyActionName(messagingChannelsData);

  return (
    <Card className="h-fit bg-slate-50 dark:bg-slate-900 hidden sm:block">
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <ActionSection
            actions={[
              ...getAvailableActions(provider),
              ...getExtraActions({
                integrationActionsEnabled,
              }),
            ]}
            notifyActionName={notifyActionName}
            title="可用操作"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSection({
  title,
  actions,
  notifyActionName,
}: {
  title: string;
  actions: ActionType[];
  notifyActionName: string;
}) {
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="grid gap-2 mt-1">
        {actions.map((actionType) => {
          const Icon = getActionIcon(actionType);
          const tooltip = actionTooltips[actionType];
          return (
            <div key={actionType} className="flex items-center gap-2">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">
                {actionType === ActionType.NOTIFY_MESSAGING_CHANNEL
                  ? notifyActionName
                  : ACTION_TYPE_LABELS[actionType]}
              </span>
              {tooltip && <TooltipExplanation text={tooltip} size="sm" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getNotifyActionName(
  messagingChannelsData: GetMessagingChannelsResponse | undefined,
) {
  const connectedChannels = getConnectedRuleNotificationChannels(
    messagingChannelsData?.channels,
  );
  const providers =
    connectedChannels.length > 0
      ? connectedChannels.map((channel) => channel.provider)
      : (messagingChannelsData?.availableProviders ?? []);
  const providerNames = Array.from(
    new Set(providers.map(getMessagingProviderName)),
  );

  return providerNames.length > 0
    ? `通知 ${formatProviderList(providerNames)}`
    : "通知";
}

function formatProviderList(providerNames: string[]) {
  if (providerNames.length === 1) return providerNames[0];
  if (providerNames.length === 2) return providerNames.join(" or ");

  return `${providerNames.slice(0, -1).join(", ")} 或 ${providerNames.at(-1)}`;
}
