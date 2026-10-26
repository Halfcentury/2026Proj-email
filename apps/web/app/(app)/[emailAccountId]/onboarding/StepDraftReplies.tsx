"use client";

import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/DraftRepliesIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepDraftReplies({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={<DraftRepliesIllustration />}
      title="准备好的回复草稿"
      description={"为每封需要回复的邮件起草符合你表达风格的回复。"}
      onNext={onNext}
    />
  );
}
