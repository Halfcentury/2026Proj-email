"use server";
import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
export const updateMeetingBriefsEmailDeliveryAction = actionClient
  .metadata({ name: "updateMeetingBriefsEmailDelivery" })
  .inputSchema(z.object({ sendEmail: z.boolean() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { sendEmail } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { meetingBriefsSendEmail: sendEmail },
    });
  });
export const updateDigestEmailDeliveryAction = actionClient
  .metadata({ name: "updateDigestEmailDelivery" })
  .inputSchema(z.object({ sendEmail: z.boolean() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { sendEmail } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { digestSendEmail: sendEmail },
    });
  });
