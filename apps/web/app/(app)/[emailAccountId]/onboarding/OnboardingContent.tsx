"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepChat } from "@/app/(app)/[emailAccountId]/onboarding/StepChat";
import { StepEmailsSorted } from "@/app/(app)/[emailAccountId]/onboarding/StepEmailsSorted";
import { StepDraftReplies } from "@/app/(app)/[emailAccountId]/onboarding/StepDraftReplies";
import { StepBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/onboarding/StepBulkUnsubscribe";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepDraft } from "@/app/(app)/[emailAccountId]/onboarding/StepDraft";
import { StepCustomRules } from "@/app/(app)/[emailAccountId]/onboarding/StepCustomRules";
import { StepInboxProcessed } from "@/app/(app)/[emailAccountId]/onboarding/StepInboxProcessed";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isDefined } from "@/utils/types";
import { env } from "@/env";
import { useCompleteOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/useCompleteOnboarding";
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/onboarding/StepCompanySize";
import { StepHowYouHeard } from "@/app/(app)/[emailAccountId]/onboarding/StepHowYouHeard";
import { useOrganizationMembership } from "@/hooks/useAccountScope";
import { useRules } from "@/hooks/useRules";
import {
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  isDraftRepliesDisabledByRuleState,
  STEP_KEYS,
  type StepKey,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";

interface OnboardingContentProps {
  step?: string;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { data: membership, isLoading: isMembershipLoading } =
    useOrganizationMembership();
  const { data: rules, isLoading: isRulesLoading } = useRules(emailAccountId);

  const canInviteTeam = false;

  const stepMap: Record<string, (() => React.ReactNode) | undefined> = {
    [STEP_KEYS.CHAT]: () => <StepChat onNext={onNext} />,
    [STEP_KEYS.EMAILS_SORTED]: () => <StepEmailsSorted onNext={onNext} />,
    [STEP_KEYS.DRAFT_REPLIES]: () => <StepDraftReplies onNext={onNext} />,
    [STEP_KEYS.BULK_UNSUBSCRIBE]: () => <StepBulkUnsubscribe onNext={onNext} />,
    [STEP_KEYS.WHO]: () => (
      <StepWho
        initialRole={data?.role || data?.personaAnalysis?.persona}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.COMPANY_SIZE]: () => <StepCompanySize onNext={onNext} />,
    [STEP_KEYS.HOW_YOU_HEARD]: () => <StepHowYouHeard onNext={onNext} />,
    [STEP_KEYS.LABELS]: () => (
      <StepLabels
        provider={provider}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.DRAFT]: () => (
      <StepDraft
        provider={provider}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.CUSTOM_RULES]: () => (
      <StepCustomRules provider={provider} onNext={onNext} />
    ),
    [STEP_KEYS.INVITE_TEAM]: canInviteTeam ? () => null : undefined,
    [STEP_KEYS.INBOX_PROCESSED]: () => <StepInboxProcessed onNext={onNext} />,
  };

  const visibleStepKeys = getVisibleOnboardingStepKeys({
    canInviteTeam,
    autoDraftDisabled:
      Boolean(env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) ||
      isDraftRepliesDisabledByRuleState(rules),
    isSelfHosted: true,
  }).filter((key) => isDefined(stepMap[key]));
  const steps = visibleStepKeys.map((key) => stepMap[key]).filter(isDefined);

  const { data, mutate } = usePersona();
  const currentStepIndex = getOnboardingStepIndex(step, visibleStepKeys);
  const clampedStep = currentStepIndex + 1;
  const totalSteps = visibleStepKeys.length;
  const currentStepKey = visibleStepKeys[currentStepIndex];
  const nextStepKey = visibleStepKeys[currentStepIndex + 1];

  const router = useRouter();

  const hasTrackedStart = useRef(false);
  const { completeAndRedirect, destination } = useCompleteOnboarding();

  const getOnboardingStepPath = useCallback(
    (stepKey: string) =>
      getOnboardingStepHref(emailAccountId, stepKey as StepKey),
    [emailAccountId],
  );

  useEffect(() => {
    // Wait for step inputs before firing — totalSteps can be wrong while loading.
    if (isMembershipLoading || isRulesLoading || !currentStepKey) return;

    if (clampedStep === 1 && !hasTrackedStart.current) {
      hasTrackedStart.current = true;
    }
  }, [
    clampedStep,
    currentStepKey,
    isMembershipLoading,
    isRulesLoading,
    totalSteps,
  ]);

  const onNext = useCallback(async () => {
    if (!currentStepKey) return;

    if (clampedStep < steps.length) {
      if (!nextStepKey) return;

      router.push(getOnboardingStepPath(nextStepKey));
    } else {
      await completeAndRedirect();
    }
  }, [
    router,

    clampedStep,
    currentStepKey,
    totalSteps,
    nextStepKey,
    steps.length,
    destination,
    completeAndRedirect,
    getOnboardingStepPath,
  ]);

  const onSkipInviteTeam = useCallback(() => {
    if (!currentStepKey) return;

    // Navigate directly — do not call onNext() which would also fire completion analytics.
    if (!nextStepKey) return;

    router.push(getOnboardingStepPath(nextStepKey));
  }, [
    router,
    clampedStep,
    currentStepKey,
    totalSteps,
    nextStepKey,
    steps.length,
    getOnboardingStepPath,
  ]);

  useEffect(() => {
    if (clampedStep !== 1 || data?.personaAnalysis) return;

    let disposed = false;
    analyzePersonaAction(emailAccountId)
      .then(() => {
        // Navigation can dispose the account's SWR cache before analysis finishes.
        if (!disposed) return mutate();
      })
      .catch((error) => {
        console.error("Failed to analyze persona:", error);
      });

    return () => {
      disposed = true;
    };
  }, [clampedStep, emailAccountId, data?.personaAnalysis, mutate]);

  const renderStep = steps[currentStepIndex] || steps[0];

  // Wait for the inputs that determine which steps are visible before rendering.
  if ((isLoading && !provider) || isMembershipLoading || isRulesLoading) {
    return null;
  }

  return (
    <>
      {/* Start ingesting provider email stats into the database early so the
          bulk-unsubscribe step's stats query has data by the time it runs */}
      <EmailStatsPreloader />
      {renderStep ? renderStep() : null}
    </>
  );
}
