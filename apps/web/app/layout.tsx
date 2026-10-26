import type { Metadata } from "next";
import { AxiomWebVitals } from "next-axiom";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import type { WebApplication, WithContext } from "schema-dts";
import "../styles/globals.css";
import { env } from "@/env";
import { GlobalProviders } from "@/providers/GlobalProviders";
import { startupImage } from "@/app/startup-image";
import { Toaster } from "@/components/Toast";
import { CookieConsentBanner } from "@/components/CookieConsent";
import {
  BRAND_ICON_URL,
  BRAND_NAME,
  SUPPORT_EMAIL,
  toAbsoluteUrl,
} from "@/utils/branding";
import { isIndexingAllowed } from "@/utils/indexing";

const aeonikFont = localFont({
  src: "../styles/aeonik-medium.woff",
  variable: "--font-title",
  preload: true,
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const title = `${BRAND_NAME} | 智能整理邮件，轻松管理收件箱`;
const description =
  "十组邮件小助手，提供智能邮件分类、回复草稿、批量退订、归档、日历、会议和附件处理。";

const indexingAllowed = isIndexingAllowed(env.NEXT_PUBLIC_BASE_URL);

// JSON-LD structured data
const jsonLd: WithContext<WebApplication> = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND_NAME,
  url: env.NEXT_PUBLIC_BASE_URL,
  description,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web Browser",
  ...{},
  featureList: [
    "智能邮件助手",
    "邮件自动化",
    "批量退订",
    "陌生邮件拦截",
    "会议记录",
    "订阅邮件管理",
  ],
  publisher: {
    "@type": "Organization",
    "@id": toAbsoluteUrl("/#organization"),
    name: BRAND_NAME,
    url: env.NEXT_PUBLIC_BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: toAbsoluteUrl(BRAND_ICON_URL),
    },
    ...(SUPPORT_EMAIL
      ? {
          contactPoint: {
            "@type": "ContactPoint" as const,
            email: SUPPORT_EMAIL,
            contactType: "customer support",
          },
        }
      : {}),
  },
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: BRAND_NAME,
    type: "website",
    url: env.NEXT_PUBLIC_BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  // issues with robots.txt: https://github.com/vercel/next.js/issues/58615#issuecomment-1852457285
  robots: {
    index: indexingAllowed,
    follow: indexingAllowed,
  },
  // pwa
  applicationName: BRAND_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND_NAME,
    startupImage,
  },
  formatDetection: {
    telephone: false,
  },
  // safe area for iOS PWA
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "white-translucent",
  },
};

export const viewport = {
  themeColor: "#FFF",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body
        className={`h-full ${env.NEXT_PUBLIC_USE_AEONIK_FONT ? aeonikFont.variable : ""} ${geist.variable} font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <GlobalProviders>
          {children}
          <Toaster />
        </GlobalProviders>

        <AxiomWebVitals />

        <CookieConsentBanner />
      </body>
    </html>
  );
}
