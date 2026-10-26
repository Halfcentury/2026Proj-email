"use client";

import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepEmailsSorted({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={<EmailsSortedIllustration />}
      title="自动整理收件箱"
      description={"为邮件添加“待回复”“订阅邮件”“陌生推广”等标签。"}
      onNext={onNext}
    />
  );
}
