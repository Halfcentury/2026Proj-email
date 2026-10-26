import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export default function ColdEmailBlockerPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="陌生邮件拦截"
        video={{
          title: "陌生邮件拦截入门",
          description: "了解如何检查被拦截邮件、恢复发件人和设置处理方式。",
          muxPlaybackId: "E29tx0001FmSQqASvIM7r87P9Pro3cq0202AiZ8rOKzsyJM",
        }}
      />
      <EmailLabelsProvider>
        <Suspense>
          <PermissionsCheck />
          <div className="mt-4">
            <ColdEmailContent />
          </div>
        </Suspense>
      </EmailLabelsProvider>
    </PageWrapper>
  );
}
