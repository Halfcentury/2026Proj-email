"use client";
import { useAction } from "next-safe-action/hooks";
import { SettingCard } from "@/components/SettingCard";
import { Switch } from "@/components/ui/switch";
import { toastError, toastSuccess } from "@/components/Toast";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateMeetingBriefsEmailDeliveryAction } from "@/utils/actions/email-delivery";
import { getActionErrorMessage } from "@/utils/error";
export function DeliveryChannelsSetting() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useMeetingBriefSettings();
  const { execute, isPending } = useAction(
    updateMeetingBriefsEmailDeliveryAction.bind(null, emailAccountId),
    {
      onSuccess() {
        toastSuccess({ description: "设置已保存" });
        mutate();
      },
      onError({ error }) {
        toastError({ description: getActionErrorMessage(error) ?? "保存失败" });
      },
    },
  );
  return (
    <SettingCard
      title="邮件通知"
      description="通过邮件接收会前简报"
      right={
        <Switch
          aria-label="通过邮件接收会前简报"
          checked={data?.meetingBriefsSendEmail ?? true}
          disabled={isLoading || isPending}
          onCheckedChange={(sendEmail) => execute({ sendEmail })}
        />
      }
    />
  );
}
