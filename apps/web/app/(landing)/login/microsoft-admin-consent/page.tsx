import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2Icon } from "lucide-react";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { getEnabledLoginProviders } from "@/utils/oauth/login-providers";
import { BRAND_NAME, SUPPORT_EMAIL, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Microsoft 管理员授权"),
  description: `为 Microsoft 365 组织批准 ${BRAND_NAME}。`,
  alternates: { canonical: "/login/microsoft-admin-consent" },
};

export default async function MicrosoftAdminConsentPage(props: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const hasMicrosoftLogin = getEnabledLoginProviders().has("microsoft");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-14 px-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] md:items-center lg:px-8">
        <section className="max-w-xl">
          <Logo className="mb-12 h-auto w-56 text-primary" />
          <h1 className="font-title text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            批准 {BRAND_NAME} 组织使用权限
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            授予租户范围的 Microsoft 管理员授权，以便组织用户连接自己的 Outlook
            邮箱。
          </p>

          <AdminConsentStatus
            status={searchParams?.status}
            error={searchParams?.error}
          />

          <div className="mt-12 space-y-6">
            {hasMicrosoftLogin ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full py-6"
              >
                <a
                  href="/api/outlook/admin-consent"
                  className="flex items-center justify-center"
                >
                  <Image
                    src="/images/microsoft.svg"
                    alt="Microsoft"
                    width={24}
                    height={24}
                    unoptimized
                  />
                  <span className="ml-3">通过 Microsoft 授予管理员授权</span>
                </a>
              </Button>
            ) : (
              <AlertBasic
                variant="destructive"
                title="Microsoft 登录尚未配置"
                description={`授予管理员授权前请先配置 Microsoft OAuth，需要帮助时联系 ${SUPPORT_EMAIL}。`}
              />
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-foreground hover:underline"
              >
                返回登录
              </Link>
            </p>
          </div>
        </section>

        <section className="space-y-8">
          {ADMIN_CONSENT_POINTS.map((point) => (
            <div key={point.title} className="flex gap-4">
              <CheckCircle2Icon className="mt-1 size-7 shrink-0 text-green-500" />
              <div>
                <h2 className="text-base font-semibold uppercase tracking-normal text-foreground">
                  {point.title}
                </h2>
                <p className="mt-1 text-base leading-7 text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

const ADMIN_CONSENT_POINTS = [
  {
    title: "Microsoft 365 集成",
    description: "支持现有 Microsoft Entra 组织。",
  },
  {
    title: "租户范围批准",
    description: "一次批准符合条件用户所需的 Microsoft 权限。",
  },
  {
    title: "用户账户连接",
    description: "每位用户仍需自行登录并连接邮箱。",
  },
  {
    title: "管理员控制",
    description: "可在 Microsoft Entra 企业应用中管理访问权限。",
  },
] as const;

function AdminConsentStatus({
  status,
  error,
}: {
  status?: string;
  error?: string;
}) {
  if (status === "success") {
    return (
      <AlertBasic
        className="mt-8"
        variant="success"
        title="管理员授权已批准"
        description="组织用户现在可通过 Microsoft 登录并连接 Outlook 邮箱。"
      />
    );
  }

  if (!error) return null;

  return (
    <AlertBasic
      className="mt-8"
      variant="destructive"
      title="管理员授权未完成"
      description="请使用可授予租户范围授权的 Microsoft 365 管理员账户重试。"
    />
  );
}
