import { z } from "zod";
import { isValidTimeZone } from "@inboxzero/scheduling";
export const bookingPlanInputSchema = z.object({
  operation: z.enum(["create", "reschedule", "cancel"]),
  bookingId: z.string().optional(),
  bookingLinkId: z.string().optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().refine(isValidTimeZone),
  guestName: z.string().trim().min(1).max(120).optional(),
  guestEmail: z.string().email().optional(),
  threadId: z.string().min(1),
  messageId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});
export const bookingStoredPlanSchema = bookingPlanInputSchema.extend({
  emailAccountId: z.string(),
  aiRunId: z.string(),
  slug: z.string(),
  calendarId: z.string(),
  calendarName: z.string(),
  endTime: z.string(),
  startTime: z.string(),
  guestName: z.string(),
  guestEmail: z.string(),
  version: z.string().nullable(),
});

export const bookingReviewSchema = bookingStoredPlanSchema.extend({
  reviewToken: z.string(),
});
