import { env } from "@/env";
export const useCleanerEnabled = () => env.NEXT_PUBLIC_CLEANER_ENABLED;
export const useFollowUpRemindersEnabled = () =>
  env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED;
export const useMeetingBriefsEnabled = () =>
  env.NEXT_PUBLIC_MEETING_BRIEFS_ENABLED;
export const useMeetingRecorderEnabled = () =>
  env.NEXT_PUBLIC_MEETING_RECORDER_ENABLED;
export const useBookingLinksEnabled = () =>
  env.NEXT_PUBLIC_BOOKING_LINKS_ENABLED;
export const useIntegrationsEnabled = () => false;
export const useIntegrationActionsEnabled = () => false;
export const useTeamsEnabled = () => false;
