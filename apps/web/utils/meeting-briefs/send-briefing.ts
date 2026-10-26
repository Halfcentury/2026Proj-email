import { render } from "@react-email/render";
import { env } from "@/env";
import { sendNotificationEmail } from "@/utils/email/send-notification-email";
import { sendMeetingBriefingEmail } from "@inboxzero/transactional-email";
import MeetingBriefingEmail, {
  generateMeetingBriefingSubject,
  type MeetingBriefingEmailProps,
  type BriefingContent,
  type InternalTeamMember,
} from "@inboxzero/transactional-email/emails/meeting-briefing";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { formatTimeInUserTimezone } from "@/utils/date";
import prisma from "@/utils/prisma";

export async function sendBriefing({
  event,
  briefingContent,
  internalTeamMembers,
  emailAccountId,
  userEmail,
  provider,
  userTimezone,
  logger,
}: {
  event: CalendarEvent;
  briefingContent: BriefingContent;
  internalTeamMembers: InternalTeamMember[];
  emailAccountId: string;
  userEmail: string;
  provider: string;
  userTimezone: string | null;
  logger: Logger;
}): Promise<void> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { meetingBriefsSendEmail: true },
  });
  if (account?.meetingBriefsSendEmail === false) {
    logger.info("Meeting briefing email delivery disabled");
    return;
  }
  await sendBriefingViaEmail({
    event,
    briefingContent: { ...briefingContent, internalTeamMembers },
    emailAccountId,
    userEmail,
    provider,
    formattedTime: formatTimeInUserTimezone(event.startTime, userTimezone),
    logger,
  });
}

async function sendBriefingViaEmail({
  event,
  briefingContent,
  emailAccountId,
  userEmail,
  provider,
  formattedTime,
  logger,
}: {
  event: CalendarEvent;
  briefingContent: BriefingContent;
  emailAccountId: string;
  userEmail: string;
  provider: string;
  formattedTime: string;
  logger: Logger;
}): Promise<void> {
  const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

  const emailProps: MeetingBriefingEmailProps = {
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    emailAccountId,
    meetingTitle: event.title,
    formattedTime,
    videoConferenceLink: event.videoConferenceLink ?? "",
    eventUrl: event.eventUrl ?? "",
    briefingContent,
    unsubscribeToken,
  };

  await sendNotificationEmail({
    emailAccountId,
    userEmail,
    provider,
    subject: generateMeetingBriefingSubject(emailProps),
    sendViaResend: () =>
      sendMeetingBriefingEmail({
        from: env.RESEND_FROM_EMAIL,
        to: userEmail,
        emailProps,
      }),
    renderHtml: () => render(MeetingBriefingEmail(emailProps)),
    logger,
  });
}
