"use client";

import { MailIcon, LightbulbIcon, UserSearchIcon } from "lucide-react";
import { SetupCard } from "@/components/SetupCard";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

const features = [
  {
    icon: <UserSearchIcon className="size-4 text-blue-500" />,
    title: "参会者背景",
    description: "参会者、所属公司及职务",
  },
  {
    icon: <MailIcon className="size-4 text-blue-500" />,
    title: "邮件历史",
    description: "与此人的近期往来",
  },
  {
    icon: <LightbulbIcon className="size-4 text-blue-500" />,
    title: "关键信息",
    description: "历史讨论中的重要细节",
  },
];

export function BriefsOnboarding({
  emailAccountId,
  hasCalendarConnected = false,
  onEnable,
  isEnabling = false,
}: {
  emailAccountId: string;
  hasCalendarConnected?: boolean;
  onEnable?: () => void;
  isEnabling?: boolean;
}) {
  return (
    <SetupCard
      imageSrc="/images/illustrations/communication.svg"
      imageAlt="Meeting Briefs"
      title="会前简报"
      description="与外部人员开会前，通过邮件或聊天应用接收简报。"
      features={features}
    >
      {hasCalendarConnected ? (
        <>
          <MessageText>配置完成！启用会前简报即可开始：</MessageText>
          <Button onClick={onEnable} loading={isEnabling}>
            启用会前简报
          </Button>
        </>
      ) : (
        <>
          <MessageText>连接日历后即可开始：</MessageText>
          <ConnectCalendar
            analyticsPage="meeting_briefs"
            onboardingReturnPath={`/${emailAccountId}/briefs`}
          />
        </>
      )}
    </SetupCard>
  );
}
