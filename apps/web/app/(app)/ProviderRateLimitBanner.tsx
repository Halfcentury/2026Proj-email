"use client";

import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { getProviderRateLimitBannerLabel } from "@/utils/email/rate-limit-mode-error";

export function ProviderRateLimitBanner() {
  const { data, isLoading, error } = useEmailAccountFull();

  if (isLoading || error || !data?.providerRateLimit) return null;

  const { provider, retryAt } = data.providerRateLimit;
  const providerLabel = getProviderRateLimitBannerLabel(provider);

  const retryAtDate = new Date(retryAt);
  const retryAtLabel = Number.isNaN(retryAtDate.getTime())
    ? retryAt
    : retryAtDate.toLocaleString("zh-CN");

  return (
    <AppAlertBanner
      title={`${providerLabel} 正在限制此账户的请求频率`}
      description={
        <p>
          十组邮件小助手的操作暂时暂停，预计恢复时间：{" "}
          <strong>{retryAtLabel}</strong>。此限制来自 {providerLabel}
          ，连接到此邮箱的其他应用也会消耗相同的请求额度。
        </p>
      }
    />
  );
}
