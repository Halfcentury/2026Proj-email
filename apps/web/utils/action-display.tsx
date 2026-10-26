import { ActionType, type MessagingProvider } from "@/generated/prisma/enums";
import { getEmailTerminology } from "@/utils/terminology";
import { sortActionsByPriority } from "@/utils/action-sort";
import {
  ArchiveIcon,
  BellIcon,
  FolderInputIcon,
  ForwardIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SendIcon,
  TagIcon,
  WebhookIcon,
  FileTextIcon,
  MailIcon,
  NewspaperIcon,
  SquareCheckBigIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { truncate } from "@/utils/string";
import {
  getIntegrationActionDisplayValue,
  getIntegrationActionLabel,
} from "@/utils/retired-action-metadata";
import { getMessagingProviderName } from "@/utils/retired-notifications";

/**
 * Hide messaging-channel draft entries when an email draft already exists,
 * so users don't see "起草回复" repeated once per connected chat app.
 */
export function getVisibleActions<T extends { type: ActionType }>(
  actions: T[],
): T[] {
  const sortedActions = sortActionsByPriority(actions);
  const hasEmailDraft = sortedActions.some(
    (action) => action.type === ActionType.DRAFT_EMAIL,
  );

  return sortedActions.filter(
    (action) =>
      !(action.type === ActionType.DRAFT_MESSAGING_CHANNEL && hasEmailDraft),
  );
}

export function getActionDisplay(
  action: {
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    notificationDestination?: string | null;
    messagingChannel?: { provider: MessagingProvider } | null;
    integrationName?: string | null;
    integrationToolName?: string | null;
    integrationArgs?: unknown;
  },
  provider: string,
  labels: Array<{ id: string; name: string }>,
): string {
  const terminology = getEmailTerminology(provider);
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      if (action.content) {
        return `起草回复：${truncate(action.content, 10)}`;
      }
      return "起草回复";
    case ActionType.LABEL: {
      let labelName: string | null | undefined = null;

      // Priority 1: Use labelId to look up current name from labels
      if (action.labelId && labels?.length) {
        const foundLabel = labels.find((l) => l.id === action.labelId);
        if (foundLabel) {
          labelName = foundLabel.name;
        }
      }

      // Priority 2: Fallback to stored label name (may be outdated but better than nothing)
      if (!labelName && action.label) {
        labelName = action.label;
      }

      return labelName
        ? `添加${terminology.label.singular}‘${truncate(labelName, 15)}’`
        : terminology.label.action;
    }
    case ActionType.ARCHIVE:
      return "归档";
    case ActionType.DELETE:
      return "删除";
    case ActionType.MARK_READ:
      return "标为已读";
    case ActionType.STAR:
      return "加星标";
    case ActionType.MARK_SPAM:
      return "标为垃圾邮件";
    case ActionType.REPLY:
      return "回复";
    case ActionType.SEND_EMAIL:
      return action.to ? `发送邮件至 ${truncate(action.to, 8)}` : "发送邮件";
    case ActionType.FORWARD:
      return action.to ? `转发至 ${truncate(action.to, 8)}` : "转发";
    case ActionType.MOVE_FOLDER:
      return action.folderName
        ? `移至文件夹‘${action.folderName}’`
        : "移至文件夹";
    case ActionType.DIGEST:
      return "加入摘要";
    case ActionType.CALL_WEBHOOK:
      return "调用 Webhook";
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      if (action.messagingChannel?.provider) {
        return `通知 ${getMessagingProviderName(action.messagingChannel.provider)}`;
      }
      return action.notificationDestination
        ? `通知 ${truncate(action.notificationDestination, 18)}`
        : "通知";
    case ActionType.NOTIFY_SENDER:
      return "通知发件人";
    case ActionType.INTEGRATION: {
      const label = getIntegrationActionLabel(action);
      const displayValue = getIntegrationActionDisplayValue(action);
      return displayValue ? `${label}: '${truncate(displayValue, 20)}'` : label;
    }
    default: {
      const exhaustiveCheck: never = action.type;
      return exhaustiveCheck;
    }
  }
}

export const ACTION_TYPE_LABELS = {
  [ActionType.LABEL]: "标签",
  [ActionType.ARCHIVE]: "归档",
  [ActionType.DELETE]: "删除",
  [ActionType.MARK_READ]: "标为已读",
  [ActionType.MARK_SPAM]: "标为垃圾邮件",
  [ActionType.STAR]: "加星标",
  [ActionType.MOVE_FOLDER]: "移至文件夹",
  [ActionType.FORWARD]: "转发",
  [ActionType.REPLY]: "回复",
  [ActionType.SEND_EMAIL]: "发送邮件",
  [ActionType.DRAFT_EMAIL]: "起草回复",
  [ActionType.DRAFT_MESSAGING_CHANNEL]: "起草渠道消息",
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: "通知消息渠道",
  [ActionType.CALL_WEBHOOK]: "调用 Webhook",
  [ActionType.DIGEST]: "加入摘要",
  [ActionType.NOTIFY_SENDER]: "通知发件人",
  // ActionType alone cannot name a specific tool; getIntegrationActionLabel
  // gives the precise name when the action is known.
  [ActionType.INTEGRATION]: getIntegrationActionLabel(),
} satisfies Record<ActionType, string>;

export function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case ActionType.LABEL:
      return TagIcon;
    case ActionType.ARCHIVE:
      return ArchiveIcon;
    case ActionType.DELETE:
      return Trash2Icon;
    case ActionType.MOVE_FOLDER:
      return FolderInputIcon;
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return FileTextIcon;
    case ActionType.REPLY:
      return ReplyIcon;
    case ActionType.SEND_EMAIL:
      return SendIcon;
    case ActionType.FORWARD:
      return ForwardIcon;
    case ActionType.MARK_SPAM:
      return ShieldCheckIcon;
    case ActionType.MARK_READ:
      return MailIcon;
    case ActionType.STAR:
      return StarIcon;
    case ActionType.CALL_WEBHOOK:
      return WebhookIcon;
    case ActionType.DIGEST:
      return NewspaperIcon;
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      return BellIcon;
    case ActionType.NOTIFY_SENDER:
      return BellIcon;
    case ActionType.INTEGRATION:
      return SquareCheckBigIcon;
    default: {
      const exhaustiveCheck: never = actionType;
      return exhaustiveCheck;
    }
  }
}
