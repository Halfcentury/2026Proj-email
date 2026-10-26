"use client";

import { useQueryState } from "nuqs";
import { useState } from "react";
import { CalendarIcon, MicIcon, SettingsIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { TimezoneDetector } from "@/components/TimezoneDetector";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import { useCalendars } from "@/hooks/useCalendars";
import { useMeetingRecorderEnabled } from "@/hooks/useFeatureFlags";
import { useMeetingRecorderSettings } from "@/hooks/useMeetingRecorder";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";
import { MeetingRecorderOnboarding } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderOnboarding";
import { MeetingRecorderSettingsDialog } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderSettingsDialog";
import { MeetingDetail } from "@/app/(app)/[emailAccountId]/meetings/MeetingDetail";
import { MeetingsList } from "@/app/(app)/[emailAccountId]/meetings/MeetingsList";
import { UpcomingMeetingsToggleList } from "@/app/(app)/[emailAccountId]/meetings/UpcomingMeetingsToggleList";
import { hasConnectedCalendar } from "@/app/(app)/[emailAccountId]/meetings/calendar-connection-state";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

export default function MeetingsPage() {
  return (
    <>
      <TimezoneDetector />
      <MeetingsPageContent />
    </>
  );
}

function MeetingsPageContent() {
  const meetingRecorderEnabled = useMeetingRecorderEnabled();

  if (!meetingRecorderEnabled) {
    return (
      <PageWrapper>
        <PageHeader title="会议" />

        <div className="mt-8 max-w-3xl">
          <ActionCard
            variant="blue"
            icon={<MicIcon className="h-5 w-5" />}
            title="会议记录功能已禁用"
            description="服务器未启用会议记录功能。请设置 NEXT_PUBLIC_MEETING_RECORDER_ENABLED=true，并参考部署文档完成配置。"
          />
        </div>
      </PageWrapper>
    );
  }

  return <MeetingRecorderPageContent />;
}

function MeetingRecorderPageContent() {
  const { emailAccountId } = useAccount();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openMeetingId, setOpenMeetingId] = useQueryState("meeting-id");

  const {
    data: calendarsData,
    isLoading: isLoadingCalendars,
    error: calendarsError,
  } = useCalendars();
  const {
    data: settings,
    isLoading: isLoadingSettings,
    error: settingsError,
    mutate,
  } = useMeetingRecorderSettings(emailAccountId);

  const { execute, status } = useAction(
    updateMeetingRecorderSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: ({ error }) => {
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to turn on the notetaker",
          }),
        });
      },
    },
  );

  const isLoading = isLoadingCalendars || isLoadingSettings;
  const error = calendarsError || settingsError;

  if (isLoading || error) {
    return (
      <PageWrapper>
        <LoadingContent loading={isLoading} error={error}>
          <div />
        </LoadingContent>
      </PageWrapper>
    );
  }

  const hasCalendarConnected = hasConnectedCalendar(calendarsData?.connections);

  const openMeeting = (meetingId: string) => {
    setOpenMeetingId(meetingId);
  };

  if (!settings?.enabled) {
    return (
      <PageWrapper>
        <MeetingRecorderOnboarding
          emailAccountId={emailAccountId}
          hasCalendarConnected={hasCalendarConnected}
          onEnable={(joinRule: MeetingJoinRule) => {
            execute({ enabled: true, joinRule });
          }}
          isEnabling={status === "executing"}
        />
        <MeetingDetail
          meetingId={openMeetingId}
          onClose={() => setOpenMeetingId(null)}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="会议" />

        <Button
          variant="outline"
          Icon={SettingsIcon}
          onClick={() => setIsSettingsOpen(true)}
        >
          设置
        </Button>
      </div>

      <div className="mt-6 max-w-3xl space-y-8">
        {!hasCalendarConnected && (
          <ActionCard
            variant="blue"
            icon={<CalendarIcon className="h-5 w-5" />}
            title="重新连接日历"
            description={
              <div className="space-y-4">
                <p>会议记录功能仍已启用，连接日历后即可查找即将开始的会议。</p>
                <ConnectCalendar
                  analyticsPage="meetings"
                  onboardingReturnPath={`/${emailAccountId}/meetings`}
                />
              </div>
            }
          />
        )}

        <UpcomingMeetingsToggleList
          emailAccountId={emailAccountId}
          onOpenMeeting={openMeeting}
        />

        <MeetingsList onOpenMeeting={openMeeting} />
      </div>

      <MeetingDetail
        meetingId={openMeetingId}
        onClose={() => setOpenMeetingId(null)}
      />

      <MeetingRecorderSettingsDialog
        emailAccountId={emailAccountId}
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </PageWrapper>
  );
}
