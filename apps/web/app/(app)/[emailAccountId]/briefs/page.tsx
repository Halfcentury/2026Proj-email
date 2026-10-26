"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateMeetingBriefsEnabledAction } from "@/utils/actions/meeting-briefs";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { TimeDurationSetting } from "@/app/(app)/[emailAccountId]/briefs/TimeDurationSetting";
import { UpcomingMeetings } from "@/app/(app)/[emailAccountId]/briefs/UpcomingMeetings";
import { BriefsOnboarding } from "@/app/(app)/[emailAccountId]/briefs/Onboarding";
import { DeliveryChannelsSetting } from "@/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting";
import { TimezoneDetector } from "@/components/TimezoneDetector";

export default function MeetingBriefsPage() {
  return (
    <>
      <TimezoneDetector />
      <MeetingBriefsPageContent />
    </>
  );
}

function MeetingBriefsPageContent() {
  const { emailAccountId } = useAccount();

  const { data: calendarsData, isLoading: isLoadingCalendars } = useCalendars();
  const { data, isLoading, error, mutate } = useMeetingBriefSettings();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  const { execute, status } = useAction(
    updateMeetingBriefsEnabledAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "设置已保存！" });
        mutate();
      },
      onError: () => {
        toastError({ description: "保存设置失败" });
      },
    },
  );

  if (isLoadingCalendars || isLoading || error) {
    return (
      <PageWrapper>
        <LoadingContent loading={isLoadingCalendars || isLoading} error={error}>
          <div />
        </LoadingContent>
      </PageWrapper>
    );
  }

  if (!hasCalendarConnected || !data?.enabled) {
    return (
      <BriefsOnboarding
        emailAccountId={emailAccountId}
        hasCalendarConnected={hasCalendarConnected}
        onEnable={() => {
          execute({ enabled: true });
        }}
        isEnabling={status === "executing"}
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader title="会前简报" />

      <div className="mt-4 space-y-4 max-w-3xl">
        {null}

        <LoadingContent loading={isLoading} error={error}>
          <div className="space-y-2">
            <SettingCard
              title="启用会前简报"
              description="与外部人员开会前接收邮件简报"
              right={
                <Toggle
                  name="enabled"
                  enabled={!!data?.enabled}
                  onChange={(enabled) => {
                    execute({ enabled });
                  }}
                  disabled={!hasCalendarConnected}
                />
              }
            />

            {!!data?.enabled && (
              <>
                <SettingCard
                  title="会议前发送简报"
                  description="设置提前多久发送简报"
                  collapseOnMobile
                  right={
                    <TimeDurationSetting
                      initialMinutes={data?.minutesBefore ?? 240}
                      onSaved={mutate}
                    />
                  }
                />

                <DeliveryChannelsSetting />

                {null}
              </>
            )}
          </div>
        </LoadingContent>

        {!!data?.enabled && hasCalendarConnected && (
          <div className="mt-8">
            <UpcomingMeetings emailAccountId={emailAccountId} />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
