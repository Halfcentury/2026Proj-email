import "../../styles/globals.css";
import type { Metadata } from "next";
import type React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Inter } from "next/font/google";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { auth } from "@/utils/auth";
import { CommandK } from "@/components/CommandK";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { AppProviders } from "@/providers/AppProviders";
import { AssessUser } from "@/app/(app)/[emailAccountId]/assess";
import { SentryIdentify } from "@/app/(app)/sentry-identify";
import { ErrorMessages } from "@/app/(app)/ErrorMessages";
import { ProviderRateLimitBanner } from "@/app/(app)/ProviderRateLimitBanner";
import { MailEngineRuntime } from "@/utils/mail-engine/MailEngineHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailViewer } from "@/components/EmailViewer";
import { SettingsDialog } from "@/app/(app)/settings/SettingsDialog";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AppLayout");

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: "#FFF",
  // safe area for iOS PWA
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  width: "device-width",
  height: "device-height",
  viewportFit: "cover",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");

  const cookieStore = await cookies();
  const isClosed = cookieStore.get("left-sidebar:state")?.value === "false";
  const bypassPremiumChecks = true;
  const feedbackEnabled =
    !bypassPremiumChecks || Boolean(process.env.FEEDBACK_WEBHOOK_URL);

  after(async () => {
    const email = session.user.email;
    try {
      await prisma.user.update({
        where: { email },
        data: { lastLogin: new Date() },
      });
    } catch (error) {
      logger.error("Failed to update last login", { email, error });
      captureException(error, { userEmail: email });
    }
  });

  return (
    <div className={inter.variable}>
      <div className="font-inter">
        <AppProviders>
          <MailEngineRuntime>
            <SideNavWithTopNav
              defaultOpen={!isClosed}
              feedbackEnabled={feedbackEnabled}
            >
              {null}
              <ErrorMessages />
              <ProviderRateLimitBanner />
              {children}
            </SideNavWithTopNav>
            <EmailViewer />
            <SettingsDialog />

            {feedbackEnabled && <FeedbackDialog />}
            <ErrorBoundary extra={{ component: "AppLayout" }}>
              <CommandK feedbackEnabled={feedbackEnabled} />
              <AssessUser />
              <SentryIdentify email={session.user.email} />
            </ErrorBoundary>
          </MailEngineRuntime>
        </AppProviders>
      </div>
    </div>
  );
}
