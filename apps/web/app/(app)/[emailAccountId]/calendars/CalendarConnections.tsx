"use client";

import { useEffect } from "react";
import { CalendarCheckIcon, FileTextIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TypographyP } from "@/components/Typography";
import { toastError } from "@/components/Toast";

export function CalendarConnections() {
  useCalendarNotifications();
  const { data, isLoading, error } = useCalendars();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <TypographyP className="text-sm">
                  连接日历后可使用：
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <CalendarCheckIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">AI 根据实际空闲时间起草回复</span>
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <FileTextIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">通话前获取会前简报</span>
                </TypographyP>
              </div>

              <div className="mt-4">
                <ConnectCalendar />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 max-sm:grid-cols-1">
            <ConnectCalendar />

            {connections.map((connection) => (
              <CalendarConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}

function useCalendarNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (!errorParam) return;

    const errorDescription = searchParams.get("error_description");
    const errorMessages: Record<
      string,
      { title: string; description: string }
    > = {
      consent_declined: {
        title: "尚未授予日历权限",
        description:
          "Microsoft 返回 AADSTS65004，表示授权已取消或未完成。请完成授权后重试。",
      },
      admin_consent_required: {
        title: "需要管理员授权",
        description:
          "Microsoft 365 租户需要管理员批准。请管理员在 Entra ID 中授权此应用后重试。",
      },
      access_denied: {
        title: "日历访问被拒绝",
        description: "Microsoft 拒绝了请求。请重试或联系管理员批准访问。",
      },
      invalid_state: {
        title: "日历请求无效",
        description: "日历授权请求无效，请重试。",
      },
      invalid_state_format: {
        title: "日历请求无效",
        description: "无法验证日历授权，请重试。",
      },
      missing_code: {
        title: "日历授权已取消",
        description: "未收到 Microsoft 授权码，请重新连接。",
      },
      connection_failed: {
        title: "连接日历失败",
        description: "无法完成日历连接，请重试。",
      },
      oauth_error: {
        title: "连接日历失败",
        description: "Microsoft 返回 OAuth 错误，请重试或联系支持。",
      },
    };

    const errorMessage = errorMessages[errorParam] || {
      title: "连接日历失败",
      description:
        errorDescription ||
        "We couldn't complete the calendar connection. Please try again.",
    };

    toastError({
      title: errorMessage.title,
      description: errorMessage.description,
    });

    router.replace(pathname);
  }, [pathname, router, searchParams]);
}
