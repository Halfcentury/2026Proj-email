"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Button as UIButton } from "@/components/ui/button";
import { signIn, signInWithSocialRedirect } from "@/utils/auth-client";
import {
  getInboxZeroDesktopApp,
  type DesktopAuthProvider,
} from "@/utils/browser-platform";
import { WELCOME_PATH } from "@/utils/config";
import { toastError } from "@/components/Toast";
import { normalizeInternalPath } from "@/utils/path";
import { buildRedirectUrl, redirectToSafeUrl } from "@/utils/redirect";
import { createClientLogger } from "@/utils/logger-client";
import type { LoginProvider } from "@/utils/oauth/login-providers";

const logger = createClientLogger("login/LoginForm");
const CONNECT_MAILBOX_PATH = "/connect-mailbox";

export function LoginForm({
  enabledProviders,
  useGoogleOauthEmulator,
  otherOptions = false,
}: {
  enabledProviders: readonly LoginProvider[];
  useGoogleOauthEmulator: boolean;
  otherOptions?: boolean;
}) {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const { callbackURL, errorCallbackURL } = getAuthCallbackUrls(next);
  const appleCallbackURL = buildConnectMailboxUrl(callbackURL);
  const showOtherOptions =
    otherOptions ||
    !enabledProviders.some(
      (provider) => provider === "google" || provider === "microsoft",
    );
  const showAppleLogin = showOtherOptions && enabledProviders.includes("apple");
  const showGoogleLogin = !otherOptions && enabledProviders.includes("google");
  const showMicrosoftLogin =
    !otherOptions && enabledProviders.includes("microsoft");
  const showSsoLogin = showOtherOptions && enabledProviders.includes("sso");

  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);

    try {
      if (await startDesktopAuthIfAvailable("google", callbackURL)) {
        return;
      }
      if (useGoogleOauthEmulator) {
        const result = await signInWithSocialRedirect({
          provider: "google",
          errorCallbackURL,
          callbackURL,
        });
        if (!result.url) {
          throw new Error("缺少 Google 登录跳转地址");
        }
        redirectToSafeUrl(result.url, { allowExternal: true });
      } else {
        await signIn.social({
          provider: "google",
          errorCallbackURL,
          callbackURL,
        });
      }
    } catch (error) {
      const description = getSocialSignInErrorMessage(error);
      logger.error("Error signing in with Google", { error });
      toastError({
        title: "Google 登录失败",
        description,
      });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    await handleSocialSignIn({
      provider: "microsoft",
      providerName: "Microsoft",
      callbackURL,
      errorCallbackURL,
      setLoading: setLoadingMicrosoft,
    });
  };

  return (
    <div className="flex flex-col justify-center gap-2 px-4">
      {showGoogleLogin ? (
        <Button size="2xl" loading={loadingGoogle} onClick={handleGoogleSignIn}>
          <span className="flex items-center justify-center">
            <Image
              src="/images/google.svg"
              alt="Google"
              width={24}
              height={24}
              unoptimized
            />
            <span className="ml-2">使用 Google 登录</span>
          </span>
        </Button>
      ) : null}

      {showMicrosoftLogin ? (
        <Button
          size="2xl"
          loading={loadingMicrosoft}
          onClick={handleMicrosoftSignIn}
        >
          <span className="flex items-center justify-center">
            <Image
              src="/images/microsoft.svg"
              alt="Microsoft"
              width={24}
              height={24}
              unoptimized
            />
            <span className="ml-2">使用 Microsoft 登录</span>
          </span>
        </Button>
      ) : null}

      {showAppleLogin ? (
        <UIButton
          variant="outline"
          size="lg"
          loading={loadingApple}
          onClick={() =>
            handleSocialSignIn({
              provider: "apple",
              providerName: "Apple",
              callbackURL: appleCallbackURL,
              errorCallbackURL,
              setLoading: setLoadingApple,
            })
          }
        >
          使用 Apple 继续
        </UIButton>
      ) : null}

      {showOtherOptions ? (
        <>
          <UIButton variant="outline" size="lg" asChild>
            <Link
              href={buildRedirectUrl("/login/email", { next: callbackURL })}
            >
              邮件验证码（已有账户）
            </Link>
          </UIButton>
          {showSsoLogin && (
            <UIButton variant="outline" size="lg" asChild>
              <Link
                href={buildRedirectUrl("/login/sso", { next: callbackURL })}
              >
                通过单点登录继续
              </Link>
            </UIButton>
          )}
          {otherOptions && (
            <UIButton variant="ghost" size="lg" asChild>
              <Link href={buildRedirectUrl("/login", { next: callbackURL })}>
                返回
              </Link>
            </UIButton>
          )}
        </>
      ) : (
        <UIButton variant="ghost" size="lg" asChild>
          <Link
            href={buildRedirectUrl("/login/options", { next: callbackURL })}
          >
            其他方式
          </Link>
        </UIButton>
      )}
    </div>
  );
}

function getAuthCallbackUrls(next: string | null) {
  const callbackURL = normalizeInternalPath(next) ?? WELCOME_PATH;
  const errorCallbackURL = isOrganizationInvitationPath(callbackURL)
    ? "/login/error?reason=org_invite"
    : "/login/error";

  return { callbackURL, errorCallbackURL };
}

function buildConnectMailboxUrl(nextPath: string) {
  if (nextPath === CONNECT_MAILBOX_PATH) return CONNECT_MAILBOX_PATH;
  return buildRedirectUrl(CONNECT_MAILBOX_PATH, { next: nextPath });
}

function isOrganizationInvitationPath(path: string) {
  const pathname = path.split("?")[0];
  return /^\/organizations\/invitations\/[^/]+\/accept\/?$/.test(pathname);
}

async function handleSocialSignIn({
  provider,
  providerName,
  callbackURL,
  errorCallbackURL,
  setLoading,
}: {
  provider: "apple" | "google" | "microsoft";
  providerName: "Apple" | "Google" | "Microsoft";
  callbackURL: string;
  errorCallbackURL: string;
  setLoading: (loading: boolean) => void;
}) {
  setLoading(true);

  try {
    if (await startDesktopAuthIfAvailable(provider, callbackURL)) {
      return;
    }
    await signIn.social({
      provider,
      errorCallbackURL,
      callbackURL,
    });
  } catch (error) {
    const description = getSocialSignInErrorMessage(error);
    logger.error(`Error signing in with ${providerName}`, { error });
    toastError({
      title: `${providerName} 登录失败`,
      description,
    });
  } finally {
    setLoading(false);
  }
}

function getSocialSignInErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (isNetworkSignInError(error.message)) {
      return "无法开始登录。请确认使用已配置的公开地址访问应用后重试。";
    }

    return error.message;
  }

  return "请重试或联系支持。";
}

function isNetworkSignInError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage === "load failed" ||
    normalizedMessage === "failed to fetch" ||
    normalizedMessage === "networkerror when attempting to fetch resource."
  );
}

async function startDesktopAuthIfAvailable(
  provider: DesktopAuthProvider,
  callbackPath: string,
) {
  const desktopApp = getInboxZeroDesktopApp();
  if (!desktopApp) return false;
  await desktopApp.startAuth(provider, { callbackPath });
  return true;
}
