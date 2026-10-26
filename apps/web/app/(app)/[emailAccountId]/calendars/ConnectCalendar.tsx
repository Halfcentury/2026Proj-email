"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import type { GetCalendarAuthUrlResponse } from "@/app/api/google/calendar/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import { CALENDAR_ONBOARDING_RETURN_COOKIE } from "@/utils/calendar/constants";
import type { AppPage } from "@/utils/analytics/product";
import { redirectToSafeUrl } from "@/utils/redirect";

export function ConnectCalendar({
  analyticsPage,
  onboardingReturnPath,
}: {
  analyticsPage?: AppPage;
  onboardingReturnPath?: string;
}) {
  const { emailAccountId } = useAccount();

  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);

  const setOnboardingReturnCookie = () => {
    if (onboardingReturnPath) {
      document.cookie = `${CALENDAR_ONBOARDING_RETURN_COOKIE}=${encodeURIComponent(onboardingReturnPath)}; path=/; max-age=180; SameSite=Lax; Secure`;
    }
  };

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("无法发起 Google 日历连接");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      setOnboardingReturnCookie();
      redirectToSafeUrl(data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "Google Calendar OAuth initiation" },
      });
      toastError({
        title: "发起 Google 日历连接失败",
        description: "请重试或联系支持",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/outlook/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("无法发起 Microsoft 日历连接");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      setOnboardingReturnCookie();
      redirectToSafeUrl(data.url, { allowExternal: true });
    } catch (error) {
      captureException(error, {
        extra: { context: "Microsoft Calendar OAuth initiation" },
      });
      toastError({
        title: "发起 Microsoft 日历连接失败",
        description: "请重试或联系支持",
      });
      setIsConnectingMicrosoft(false);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap md:flex-nowrap">
      <Button
        onClick={handleConnectGoogle}
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/google.svg"
          alt="Google"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingGoogle ? "正在连接…" : "添加 Google 日历"}
      </Button>

      <Button
        onClick={handleConnectMicrosoft}
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        variant="outline"
        className="flex items-center gap-2 w-full md:w-auto"
      >
        <Image
          src="/images/microsoft.svg"
          alt="Microsoft"
          width={16}
          height={16}
          unoptimized
        />
        {isConnectingMicrosoft ? "正在连接…" : "添加 Outlook 日历"}
      </Button>
    </div>
  );
}
