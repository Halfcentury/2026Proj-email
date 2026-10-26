"use client";

import { useState, useCallback } from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { ArchiveIcon, RotateCcwIcon, TagsIcon } from "lucide-react";
import { SetupDialog } from "@/components/SetupCard";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";

const features = [
  {
    icon: <TagsIcon className="size-4 text-blue-500" />,
    title: "自动分类",
    description: "自动将发件人分为订阅邮件、收据、营销等类别",
  },
  {
    icon: <ArchiveIcon className="size-4 text-blue-500" />,
    title: "按分类归档",
    description: "一次整理整个分类的邮件",
  },
  {
    icon: <RotateCcwIcon className="size-4 text-blue-500" />,
    title: "可随时恢复",
    description: "归档后的邮件仍可随时查找和恢复",
  },
];

export function AutoCategorizationSetup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { emailAccountId } = useAccount();
  const { setIsBulkCategorizing } = useCategorizeProgress();

  const [isEnabling, setIsEnabling] = useState(false);

  const enableFeature = useCallback(async () => {
    setIsEnabling(true);
    setIsBulkCategorizing(true);

    try {
      const result = await bulkCategorizeSendersAction(emailAccountId);

      if (result?.serverError) {
        throw new Error(result.serverError);
      }

      if (!result?.data) {
        toastSuccess({
          description: "分类已开始。",
        });
        onOpenChange?.(false);
      } else if (result.data.totalUncategorizedSenders) {
        toastSuccess({
          description: `正在为 ${result.data.totalUncategorizedSenders} 位发件人分类，可能需要几分钟。`,
        });
        onOpenChange?.(false);
      } else {
        toastSuccess({
          description: "暂无更多待分类的发件人。",
        });
        setIsBulkCategorizing(false);
        onOpenChange?.(false);
      }
    } catch (error) {
      toastError({
        description: `启用功能失败：${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setIsBulkCategorizing(false);

      if (isUpgradeError(error)) {
        onOpenChange?.(false);
      }
    } finally {
      setIsEnabling(false);
    }
  }, [emailAccountId, onOpenChange, setIsBulkCategorizing]);

  return (
    <SetupDialog
      open={open}
      onOpenChange={onOpenChange}
      dialogContentProps={{
        hideCloseButton: true,
        onInteractOutside: (event) => event.preventDefault(),
        onEscapeKeyDown: (event) => event.preventDefault(),
      }}
      imageSrc="/images/illustrations/working-vacation.svg"
      imageAlt="Bulk Archive"
      title="批量归档"
      description="只需几次点击即可批量归档大量邮件。"
      features={features}
    >
      <Button onClick={enableFeature} loading={isEnabling}>
        开始使用
      </Button>
    </SetupDialog>
  );
}

function isUpgradeError(error: unknown) {
  return error instanceof Error && error.message.includes("Please upgrade");
}
