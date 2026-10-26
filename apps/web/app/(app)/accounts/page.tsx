"use client";

import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Trash2, MoreVertical, Settings } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AlertError } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardTitle,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccounts } from "@/hooks/useAccounts";
import { deleteEmailAccountAction } from "@/utils/actions/user";
import { toastSuccess, toastError } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { prefixPath } from "@/utils/path";
import { AddAccount } from "@/app/(app)/accounts/AddAccount";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { logOut } from "@/utils/user";
import { getAndClearAuthErrorCookie } from "@/utils/auth-cookies";
import { getActionErrorMessage } from "@/utils/error";
import { BRAND_NAME } from "@/utils/branding";
import {
  CALENDAR_SCOPES,
  SCOPES as MICROSOFT_EMAIL_SCOPES,
} from "@/utils/outlook/scopes";
import { MICROSOFT_DRIVE_SCOPES } from "@/utils/drive/scopes";
import { clearLocalMailAccountState } from "@/utils/mail-engine/clear-local-mail-account";
import { clearOfflineMailCacheForAccount } from "@/utils/offline/clear-mail-cache";

export default function AccountsPage() {
  const { data, isLoading, error, mutate } = useAccounts();
  const notification = useAccountNotifications();

  return (
    <PageWrapper>
      <PageHeader title="账户" />
      {notification ? (
        <AlertError
          className="mt-4"
          title={notification.title}
          description={notification.description}
        />
      ) : null}

      <LoadingContent loading={isLoading} error={error}>
        <div className="grid grid-cols-1 gap-4 py-6 lg:grid-cols-2 xl:grid-cols-3">
          {data?.emailAccounts.map((emailAccount) => (
            <AccountItem
              key={emailAccount.id}
              emailAccount={emailAccount}
              onAccountDeleted={mutate}
            />
          ))}
          <AddAccount />
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}

function AccountItem({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  return (
    <Link href={prefixPath(emailAccount.id, "/automation")} className="block">
      <Card className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">
        <AccountHeader
          emailAccount={emailAccount}
          onAccountDeleted={onAccountDeleted}
        />
      </Card>
    </Link>
  );
}

function AccountHeader({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  return (
    <CardHeader className="flex flex-row items-center gap-3 space-y-0">
      <Avatar>
        <AvatarImage src={emailAccount.image || undefined} />
        <AvatarFallback>
          {emailAccount.name?.[0] || emailAccount.email?.[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col space-y-1.5 flex-1">
        <CardTitle>{emailAccount.name}</CardTitle>
        <CardDescription>{emailAccount.email}</CardDescription>
      </div>
      <div
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        onMouseDown={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
          }
        }}
      >
        <AccountOptionsDropdown
          emailAccount={emailAccount}
          onAccountDeleted={onAccountDeleted}
        />
      </div>
    </CardHeader>
  );
}

function AccountOptionsDropdown({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    email: string;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  const { execute, isExecuting } = useAction(deleteEmailAccountAction, {
    onSuccess: async () => {
      toastSuccess({
        title: "邮箱账户已删除",
        description: "邮箱账户已成功删除。",
      });
      onAccountDeleted();
      if (emailAccount.isPrimary) {
        await logOut("/login");
      } else {
        try {
          await clearLocalMailAccountState(emailAccount.id);
        } catch {
          toastError({
            title: "设备上仍有本地邮件",
            description: "账户已删除。请退出登录以清除设备上的该账户邮件。",
          });
        }
        await clearOfflineMailCacheForAccount(emailAccount.id);
      }
    },
    onError: (error) => {
      toastError({
        title: "删除邮箱账户失败",
        description: getActionErrorMessage(error.error),
      });
      onAccountDeleted();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="账户选项">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        <DropdownMenuItem asChild>
          <Link
            href={prefixPath(emailAccount.id, "/setup")}
            className="flex items-center gap-2"
            onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
          >
            <Settings className="size-4" />
            配置
          </Link>
        </DropdownMenuItem>
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              onSelect={(e: Event) => {
                e?.preventDefault();
                e?.stopPropagation?.();
              }}
              onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
              className="flex items-center gap-2 text-destructive focus:text-destructive"
              disabled={isExecuting}
            >
              <Trash2 className="size-4" />
              删除
            </DropdownMenuItem>
          }
          title="删除账户"
          description={
            emailAccount.isPrimary
              ? `确定删除“${emailAccount.email}”吗？这是主账户，删除后需要重新登录。剩余账户中添加最早的账户将成为主账户。${BRAND_NAME} 中“${emailAccount.email}”的所有数据将被永久删除。`
              : `确定删除“${emailAccount.email}”吗？这将删除 ${BRAND_NAME} 中该账户的所有数据。`
          }
          confirmText="删除"
          onConfirm={() => {
            execute({ emailAccountId: emailAccount.id });
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useAccountNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [notification, setNotification] = useState<AccountNotification | null>(
    null,
  );

  useEffect(() => {
    const authErrorCookie = getAndClearAuthErrorCookie();
    const errorParam = searchParams.get("error") || authErrorCookie;
    const successParam = searchParams.get("success");

    if (errorParam) {
      const errorMessage = getAccountErrorMessage(
        errorParam,
        searchParams.get("error_description"),
      );
      setNotification(errorMessage);

      toastError({
        title: errorMessage.title,
        description: errorMessage.toastDescription,
      });

      router.replace(pathname);
      return;
    }

    if (successParam) {
      const successMessages: Record<
        string,
        { title: string; description: string }
      > = {
        account_merged: {
          title: "账户合并成功！",
          description: "账户已合并。",
        },
        account_created_and_linked: {
          title: "账户添加成功！",
          description: "新账户已关联。",
        },
        tokens_updated: {
          title: "账户重新连接成功！",
          description: "账户权限已刷新。",
        },
      };

      const successMessage = successMessages[successParam] || {
        title: "成功",
        description: "操作已完成。",
      };

      toastSuccess({
        title: successMessage.title,
        description: successMessage.description,
      });

      setNotification(null);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return notification;
}

type AccountNotification = {
  title: string;
  description: ReactNode;
  toastDescription: string;
};

function getAccountErrorMessage(
  errorParam: string,
  errorDescription: string | null,
): AccountNotification {
  const defaultDescription =
    errorDescription || "An error occurred. Please try again.";

  const errorMessages: Record<string, AccountNotification> = {
    account_not_found_for_merge: {
      title: "未找到账户",
      description: `${BRAND_NAME} 中尚无此账户，请选择“这是新账户”。`,
      toastDescription: `${BRAND_NAME} 中尚无此账户，请选择“这是新账户”。`,
    },
    account_already_exists: {
      title: "账户已存在",
      description: `该账户已关联其他 ${BRAND_NAME} 用户。请登录对应用户、使用其他邮箱或联系支持。`,
      toastDescription: `该账户已关联其他 ${BRAND_NAME} 用户。请登录对应用户、使用其他邮箱或联系支持。`,
    },
    reconnect_account_mismatch: {
      title: "登录的账户不匹配",
      description:
        "登录的账户与需要重新连接的账户不同。请退出该邮箱服务，或选择原账户后重试。",
      toastDescription:
        "登录的账户与需要重新连接的账户不同。请退出该邮箱服务，或选择原账户后重试。",
    },
    already_linked_to_self: {
      title: "账户已关联",
      description: "此账户已关联到当前用户。",
      toastDescription: "此账户已关联到当前用户。",
    },
    provider_sign_in_required: {
      title: "需要通过邮箱服务登录",
      description:
        "通过邮件验证码登录后无法连接邮箱。请使用 Google 或 Microsoft 登录后重试。",
      toastDescription:
        "通过邮件验证码登录后无法连接邮箱。请使用 Google 或 Microsoft 登录后重试。",
    },
    invalid_state: {
      title: "请求无效",
      description: "身份验证请求无效，请重试。",
      toastDescription: "身份验证请求无效，请重试。",
    },
    invalid_state_format: {
      title: "邮箱服务返回的响应无效",
      description:
        "无法验证账户授权结果。请重新关联账户；若问题持续，请联系支持。",
      toastDescription: "无法验证账户授权结果，请重新关联账户。",
    },
    missing_code: {
      title: "身份验证失败",
      description: "未能获取验证码，请重试。",
      toastDescription: "未能获取验证码，请重试。",
    },
    consent_declined: {
      title: "尚未授予 Microsoft 权限",
      description: `在 ${BRAND_NAME} 获得所需权限前，Microsoft 登录已取消。请重试并完成授权。`,
      toastDescription: `在 ${BRAND_NAME} 获得所需权限前，Microsoft 登录已取消。请重试并完成授权。`,
    },
    admin_consent_required: {
      title: "需要管理员批准",
      description: buildMicrosoftPermissionHelp(
        `Your Microsoft 365 organization requires admin approval before ${BRAND_NAME} can access this account.`,
      ),
      toastDescription: `${BRAND_NAME} 访问此账户前需要组织批准。请联系 Microsoft 365 管理员为 ${BRAND_NAME} 授权后重试。`,
    },
    invalid_scope_configuration: {
      title: "需要检查 Microsoft 应用配置",
      description: buildMicrosoftPermissionHelp(
        "Microsoft rejected the requested permissions for this app.",
      ),
      toastDescription:
        "Microsoft 拒绝了权限请求，请管理员检查 Microsoft Graph 委派权限及跳转地址后重试。",
    },
    consent_incomplete: {
      title: "需要更多 Microsoft 权限",
      description: buildMicrosoftPermissionHelp(
        `Microsoft connected the account, but did not grant all required permissions to ${BRAND_NAME}.`,
      ),
      toastDescription: `Microsoft 已连接账户，但未授予全部所需权限。请重新连接并批准所有权限；若组织限制授权，请管理员先批准 ${BRAND_NAME}。`,
    },
    link_failed: {
      title: "关联账户失败",
      description:
        errorDescription || "Failed to link account. Please try again.",
      toastDescription:
        errorDescription || "Failed to link account. Please try again.",
    },
  };

  return (
    errorMessages[errorParam] || {
      title: "错误",
      description: defaultDescription,
      toastDescription: defaultDescription,
    }
  );
}

function buildMicrosoftPermissionHelp(summary: string) {
  return (
    <div className="space-y-3">
      <p>
        {summary} 这通常表示 Microsoft 365
        组织已允许登录，但未授予完成邮箱连接所需的全部权限。
      </p>
      <p>
        请联系 Microsoft 365 管理员批准 {BRAND_NAME} 以下 Microsoft Graph
        权限，然后重试。
      </p>
      <Button asChild size="sm">
        <Link href="/login/microsoft-admin-consent">
          打开 Microsoft 管理员批准页面
        </Link>
      </Button>
      <div>
        <p className="font-medium">邮件和收件箱连接</p>
        <PermissionList scopes={MICROSOFT_EMAIL_SCOPES} />
      </div>
      <div>
        <p className="font-medium">连接其他 Microsoft 功能时需要的额外权限</p>
        <div className="space-y-2">
          <div>
            <p className="font-medium">日历</p>
            <PermissionList scopes={CALENDAR_SCOPES} />
          </div>
          <div>
            <p className="font-medium">文档和 OneDrive</p>
            <PermissionList scopes={MICROSOFT_DRIVE_SCOPES} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PermissionList({ scopes }: { scopes: readonly string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5">
      {scopes.map((scope) => (
        <li key={scope}>
          <code>{scope}</code>
        </li>
      ))}
    </ul>
  );
}
