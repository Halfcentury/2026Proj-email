"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import {
  useCookieBannerOpen,
  useCookieConsent,
} from "@/hooks/useCookieConsent";
import { BRAND_NAME } from "@/utils/branding";
import { reopenCookieConsent, setCookieConsent } from "@/utils/cookie-consent";

export function CookieConsentBanner() {
  const open = useCookieBannerOpen();
  if (!open) return null;

  return (
    <section
      aria-label="Cookie 授权"
      className="fixed inset-x-3 bottom-3 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="rounded-xl border bg-background p-4 shadow-lg">
        <p className="text-sm font-medium text-foreground">尊重你的隐私</p>
        <p className="mt-1 text-sm text-muted-foreground">
          我们使用 Cookie 了解使用情况，产品： {BRAND_NAME}{" "}
          ，并评估推广效果。你可以随时修改选择。{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground"
          >
            隐私政策
          </Link>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCookieConsent("denied")}
          >
            拒绝
          </Button>
          <Button
            variant="primaryBlack"
            size="sm"
            onClick={() => setCookieConsent("granted")}
          >
            接受
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Renders tracking scripts only once the visitor's consent allows them. */
export function WithCookieConsent({ children }: { children: React.ReactNode }) {
  const consent = useCookieConsent();
  // Without the banner, scripts render on the server as they always have.
  if (!env.NEXT_PUBLIC_COOKIE_CONSENT_ENABLED) return children;
  if (consent !== "not-required" && consent !== "granted") return null;

  return children;
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const consent = useCookieConsent();
  if (consent !== "granted" && consent !== "denied") return null;

  return (
    <button type="button" className={className} onClick={reopenCookieConsent}>
      Cookie 设置
    </button>
  );
}
