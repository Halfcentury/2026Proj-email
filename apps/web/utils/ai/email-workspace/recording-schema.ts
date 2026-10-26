import { z } from "zod";
export const recordingInputSchema = z
  .object({
    threadId: z.string().min(1),
    messageId: z.string().min(1),
    enabled: z.boolean().optional(),
    calendarEventId: z.string().min(1).optional(),
    join: z.boolean().optional(),
  })
  .refine(
    (value) =>
      (value.enabled !== undefined &&
        !value.calendarEventId &&
        value.join === undefined) ||
      (value.enabled === undefined &&
        Boolean(value.calendarEventId) &&
        value.join !== undefined),
    "请分别确认全局记录设置和单场会议记录。",
  );
