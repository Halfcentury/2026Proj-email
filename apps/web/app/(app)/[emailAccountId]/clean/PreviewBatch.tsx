"use client";

import { useState } from "react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  CardGreen,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cleanInboxAction } from "@/utils/actions/clean";
import { CleanAction } from "@/generated/prisma/enums";
import type { CleanupJob } from "@/generated/prisma/client";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { useAccount } from "@/providers/EmailAccountProvider";

export function PreviewBatch({ job }: { job: CleanupJob }) {
  const { emailAccountId } = useAccount();
  const [, setIsPreviewBatch] = useQueryState("isPreviewBatch", parseAsBoolean);
  const [isLoading, setIsLoading] = useState(false);

  const handleRunOnFullInbox = async () => {
    setIsLoading(true);
    setIsPreviewBatch(false);
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: job.daysOld,
      instructions: job.instructions || "",
      action: job.action,
      skips: {
        reply: job.skipReply,
        starred: job.skipStarred,
        calendar: job.skipCalendar,
        receipt: job.skipReceipt,
        attachment: job.skipAttachment,
        conversation: job.skipConversation,
      },
    });

    setIsLoading(false);

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }
  };

  return (
    <CardGreen className="mb-4">
      <CardHeader>
        <CardTitle>预览运行</CardTitle>
        {/* <CardDescription>
          We processed {total} emails. {archived} were{" "}
          {job.action === CleanAction.ARCHIVE ? "archived" : "marked as read"}.
        </CardDescription> */}
        <CardDescription>
          正在整理 {PREVIEW_RUN_COUNT} 封邮件，供你查看整理效果。
        </CardDescription>
        <CardDescription>
          如需撤销，请将鼠标移到“
          {job.action === CleanAction.ARCHIVE ? "归档" : "标为已读"}
          ”标记上，点击撤销。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button onClick={handleRunOnFullInbox} loading={isLoading}>
          处理整个收件箱
        </Button>
        {/* {disableRunOnFullInbox && (
          <CardDescription className="font-semibold">
            All emails have been processed
          </CardDescription>
        )} */}
      </CardContent>
    </CardGreen>
  );
}
