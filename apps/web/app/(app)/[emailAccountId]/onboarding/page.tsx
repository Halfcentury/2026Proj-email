import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Onboarding } from "@/app/(app)/[emailAccountId]/onboarding/Onboarding";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const maxDuration = 300;

export const metadata: Metadata = {
  title: getBrandTitle("入门配置"),
  description: `了解 ${BRAND_NAME} 的使用方式并完成配置。`,
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{
    step?: string | string[];
    force?: string | string[];
    paywallFirst?: string | string[];
  }>;
}) {
  const [searchParams, { emailAccountId }, cookieStore] = await Promise.all([
    props.searchParams,
    props.params,
    cookies(),
  ]);
  const step = getSingleSearchParamValue(searchParams.step);
  const force = getSingleSearchParamValue(searchParams.force);
  const paywallFirst = getSingleSearchParamValue(searchParams.paywallFirst);

  return (
    <Suspense>
      <Onboarding step={step} />
    </Suspense>
  );
}

function getSingleSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
