import "server-only";
import prisma from "@/utils/prisma";

/** Callers verify the provider thread before disclosing its associated records. */
export async function getWorkspaceResources(
  emailAccountId: string,
  threadId: string,
) {
  const [links, bookings, meetings, operations, account] = await Promise.all([
    prisma.bookingLink.findMany({
      where: { emailAccountId, isActive: true },
      select: {
        id: true,
        title: true,
        slug: true,
        durationMinutes: true,
        destinationCalendar: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        emailAccountId,
        sourceContext: { path: ["threadId"], equals: threadId },
      },
      orderBy: { startTime: "desc" },
      take: 10,
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        startTime: true,
        endTime: true,
        bookingLinkId: true,
        status: true,
      },
    }),
    prisma.meeting.findMany({
      where: {
        emailAccountId,
        sourceContext: { path: ["threadId"], equals: threadId },
      },
      orderBy: { startTime: "desc" },
      take: 10,
      select: {
        id: true,
        eventTitle: true,
        startTime: true,
        followUpDraftId: true,
      },
    }),
    prisma.chatMessage.findMany({
      where: {
        chat: { emailAccountId, deletedAt: null },
        metadata: { path: ["threadId"], equals: threadId },
        id: { startsWith: "workspace-operation:" },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, metadata: true },
    }),
    prisma.emailAccount.findUniqueOrThrow({
      where: { id: emailAccountId },
      select: { timezone: true },
    }),
  ]);
  return {
    timezone: account.timezone || "UTC",
    operations: operations.flatMap((message) => {
      const receipt = (
        message.metadata as {
          workspaceOperation?: {
            completedAt: string;
            summary?: string;
            issues: string[];
            href?: string;
          };
        } | null
      )?.workspaceOperation;
      return receipt ? [{ id: message.id, ...receipt }] : [];
    }),
    links,
    meetings: meetings.map((meeting) => ({
      ...meeting,
      startTime: meeting.startTime.toISOString(),
    })),
    bookings: bookings.map((booking) => ({
      ...booking,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
    })),
  };
}
