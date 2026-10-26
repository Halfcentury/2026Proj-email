"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeading, TypographyP } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { BRAND_NAME } from "@/utils/branding";
import { redirectToSafeUrl } from "@/utils/redirect";

export default function PermissionsConsentPage() {
  const { emailAccountId, provider, isLoading: accountLoading } = useAccount();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const isMicrosoft = provider === "microsoft";

  const handleReconnect = async () => {
    setIsReconnecting(true);

    try {
      const accountProvider = provider === "microsoft" ? "microsoft" : "google";
      const url = await getAccountLinkingUrl(accountProvider, {
        reconnectEmailAccountId: emailAccountId,
      });
      redirectToSafeUrl(url, { allowExternal: true });
    } catch (error) {
      toastError({
        title: "发起重新连接失败",
        description:
          error instanceof Error
            ? error.message
            : "Please try again or contact support",
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <PageHeading className="text-center">缺少所需权限</PageHeading>

      <TypographyP className="mx-auto mt-4 max-w-prose text-center">
        {isMicrosoft
          ? `Microsoft 账户已连接，但 ${BRAND_NAME} 缺少部分 Microsoft 365 必需权限。`
          : `请登录并授予全部所需权限，以便 ${BRAND_NAME} 正常运行。`}
      </TypographyP>

      {isMicrosoft && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          若组织限制用户授权，请联系 Microsoft 365 管理员批准 {BRAND_NAME}{" "}
          ，然后重新连接账户。
        </TypographyP>
      )}
      {!isMicrosoft && (
        <TypographyP className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
          重新连接账户并批准全部请求权限。
        </TypographyP>
      )}

      <Button
        className="mt-4"
        onClick={handleReconnect}
        loading={isReconnecting}
        disabled={isReconnecting || accountLoading}
      >
        重新连接账户
      </Button>

      <p className="mt-8 text-center text-muted-foreground">
        遇到问题？{" "}
        <Link href="/logout" className="underline hover:text-primary">
          退出登录
        </Link>{" "}
        后重新登录。
      </p>

      <div className="mt-8">
        <Image
          src="/images/illustrations/falling.svg"
          alt=""
          width={400}
          height={400}
          unoptimized
          className="dark:brightness-90 dark:invert"
        />
      </div>
    </div>
  );
}
