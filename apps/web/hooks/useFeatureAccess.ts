"use client";
import { useUser } from "@/hooks/useUser";
export function useFeatureAccess() {
  const response = useUser();
  return {
    ...response,
    premium: null,
    canManageBilling: false,
    isPremium: true,
    hasUnsubscribeAccess: true,
    unsubscribeCreditsRemaining: Number.MAX_SAFE_INTEGER,
    hasAiAccess: true,
    isProPlanWithoutApiKey: false,
    tier: "PROFESSIONAL_ANNUALLY" as const,
  };
}
export const usePremium = useFeatureAccess;
const optionalModal = {
  PremiumModal: () => null,
  openModal: () => {},
  onOpen: () => {},
  closeModal: () => {},
};
// Consumers use these callbacks as effect dependencies; keep their identity stable.
export function usePremiumModal() {
  return optionalModal;
}
