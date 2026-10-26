import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { AIChatButton } from "@/app/(app)/[emailAccountId]/assistant/AIChatButton";
import { AllRulesDisabledBanner } from "@/app/(app)/[emailAccountId]/assistant/AllRulesDisabledBanner";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import {
  STEP_KEYS,
  getOnboardingStepHref,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { AutomationTabs } from "@/app/(app)/[emailAccountId]/automation/AutomationTabs";

export const maxDuration = 300; // Applies to the actions

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  // onboarding redirect
  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(ASSISTANT_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    const hasRule = await prisma.rule.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (!hasRule) {
      redirect(getOnboardingStepHref(emailAccountId, STEP_KEYS.LABELS));
    }
  }

  return (
    <EmailLabelsProvider>
      <Suspense>
        <PermissionsCheck />

        <PageWrapper>
          <div className="flex items-center justify-between">
            <div>
              <PageHeader title="自动化" video={undefined} />
            </div>

            <div className="ml-4">
              <AIChatButton />
            </div>
          </div>

          <AllRulesDisabledBanner />

          <AutomationTabs />
        </PageWrapper>
      </Suspense>
    </EmailLabelsProvider>
  );
}
