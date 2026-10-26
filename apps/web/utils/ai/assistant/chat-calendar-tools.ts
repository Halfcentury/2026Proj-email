import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  calendarQuerySchema,
  queryCalendar,
} from "@/utils/ai/email-workspace/calendar";
export const getCalendarEventsTool = (options: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Query calendar events in an exact date range and IANA timezone. An unavailable or partial result must never be interpreted as free time.",
    inputSchema: calendarQuerySchema,
    execute: (input) => queryCalendar({ ...options, ...input }),
  });
export type GetCalendarEventsTool = InferUITool<
  ReturnType<typeof getCalendarEventsTool>
>;
