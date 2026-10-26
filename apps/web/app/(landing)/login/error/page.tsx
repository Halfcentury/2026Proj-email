"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import {
  getEmailAlreadyLinkedDescription,
  getRequiresReconsentDescription,
} from "@/app/(landing)/login/messages";
import { Button } from "@/components/ui/button";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { Loading } from "@/components/Loading";
import { WELCOME_PATH } from "@/utils/config";
import { CrispChatLoggedOutVisible } from "@/components/CrispChat";
import { getAndClearAuthErrorCookie } from "@/utils/auth-cookies";
import { SUPPORT_EMAIL } from "@/utils/branding";

const errorMessages: Record<string, { title: string; description: string }> = {
  email_not_found: {
    title: "账户未获授权",
    description:
      "此账户无权访问应用，可能不属于允许的组织。请联系管理员或使用其他账户登录。",
  },
  signup_not_allowed: {
    title: "注册受限",
    description: "此部署仅允许指定邮箱或域名注册。请联系管理员或使用其他账户。",
  },
  email_already_linked: {
    title: "邮箱已关联",
    description: getEmailAlreadyLinkedDescription(),
  },
  account_not_linked: {
    title: "登录方式不匹配",
    description:
      "此邮箱已注册，但使用了其他登录方式或服务商账户。请使用原登录方式，或联系支持重新关联。",
  },
  org_invite_invalid_code: {
    title: "组织邀请登录失败",
    description:
      "加入组织时未能完成登录。请重新打开邀请链接；若仍失败，请先用此邮箱原账户登录，再接受邀请。",
  },
  invalid_code: {
    title: "登录会话已过期",
    description:
      "登录链接已失效，可能重复打开、超时或已使用。请从登录页面重新开始。",
  },
  requiresreconsent: {
    title: "需要刷新权限",
    description: getRequiresReconsentDescription(),
  },
};

function LoginErrorContent() {
  const hasTrackedAuthFailure = useRef(false);
  const { data, isLoading, error } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error")?.toLowerCase();
  const reason = searchParams.get("reason")?.toLowerCase();
  const resolvedErrorCode = resolveErrorCode({ errorCode, reason });

  useEffect(() => {
    if (isLoading || data?.id || hasTrackedAuthFailure.current) return;

    hasTrackedAuthFailure.current = true;
  }, [data?.id, isLoading, resolvedErrorCode]);

  // For some reason users are being sent to this page when logged in
  // This will redirect them out of this page to the app
  useEffect(() => {
    if (data?.id) {
      const authErrorCookie = getAndClearAuthErrorCookie();

      if (authErrorCookie) {
        router.push("/accounts");
      } else {
        router.push(WELCOME_PATH);
      }
    }
  }, [data, router]);

  if (isLoading) return <Loading />;
  // will redirect to welcome if user is logged in
  if (data?.id) return <Loading />;

  const errorInfo = resolvedErrorCode ? errorMessages[resolvedErrorCode] : null;
  const title = errorInfo?.title || "Error Logging In";
  const supportText = `If this error persists, please use the support chat or email us at ${SUPPORT_EMAIL}.`;
  const fallbackDescription = resolvedErrorCode
    ? `Please try signing in again. (Error code: ${resolvedErrorCode}) ${supportText}`
    : `Please try signing in again. ${supportText}`;
  const description = errorInfo?.description
    ? `${errorInfo.description} ${supportText}`
    : fallbackDescription;

  return (
    <LoadingContent loading={isLoading} error={error}>
      <ErrorPage
        title={title}
        description={description}
        button={
          <Button asChild>
            <Link href="/login">登录</Link>
          </Button>
        }
      />
      {/* <AutoLogOut loggedIn={!!session?.user.email} /> */}
    </LoadingContent>
  );
}

export default function LogInErrorPage() {
  return (
    <BasicLayout>
      <Suspense fallback={<Loading />}>
        <LoginErrorContent />
      </Suspense>

      <Suspense>
        <CrispChatLoggedOutVisible />
      </Suspense>
    </BasicLayout>
  );
}

function resolveErrorCode({
  errorCode,
  reason,
}: {
  errorCode?: string;
  reason?: string;
}) {
  if (reason === "org_invite" && errorCode === "invalid_code") {
    return "org_invite_invalid_code";
  }

  return errorCode;
}
