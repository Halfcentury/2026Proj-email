"use client";

import { useState, type ReactElement } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";
import { usePremium } from "@/hooks/useFeatureAccess";
import { usePremiumModal } from "@/hooks/useFeatureAccess";
import type { ButtonProps } from "@/components/ui/button";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { Tooltip } from "@/components/Tooltip";
import { useAccount } from "@/providers/EmailAccountProvider";

export function CategorizeWithAiButton({
  buttonProps,
}: {
  buttonProps?: ButtonProps;
}) {
  const { emailAccountId } = useAccount();
  const [isCategorizing, setIsCategorizing] = useState(false);
  const { hasAiAccess } = usePremium();
  const { PremiumModal, openModal: openPremiumModal } = usePremiumModal();

  const { setIsBulkCategorizing } = useCategorizeProgress();

  return (
    <>
      <CategorizeWithAiButtonTooltip
        hasAiAccess={hasAiAccess}
        openPremiumModal={openPremiumModal}
      >
        <Button
          type="button"
          loading={isCategorizing}
          disabled={!hasAiAccess}
          onClick={async () => {
            if (isCategorizing) return;
            toast.promise(
              async () => {
                setIsCategorizing(true);
                setIsBulkCategorizing(true);
                try {
                  const result =
                    await bulkCategorizeSendersAction(emailAccountId);

                  if (result?.serverError) {
                    throw new Error(result.serverError);
                  }

                  const totalUncategorizedSenders =
                    result?.data?.totalUncategorizedSenders || 0;

                  if (totalUncategorizedSenders === 0) {
                    setIsBulkCategorizing(false);
                  }

                  return result?.data;
                } catch (error) {
                  setIsBulkCategorizing(false);
                  throw error;
                } finally {
                  setIsCategorizing(false);
                }
              },
              {
                loading: "正在分类发件人，可能需要一些时间。",
                success: (
                  data:
                    | { totalUncategorizedSenders: number | undefined }
                    | undefined,
                ) => {
                  if (!data) {
                    return "分类已开始。";
                  }

                  return data.totalUncategorizedSenders
                    ? `Categorizing ${data.totalUncategorizedSenders} senders...`
                    : "No more senders to categorize right now.";
                },
                error: (err: unknown) => {
                  const message =
                    err instanceof Error
                      ? err.message
                      : "An unknown error occurred.";
                  return `发件人分类失败：${message}`;
                },
              },
            );
          }}
          {...buttonProps}
        >
          {buttonProps?.children || (
            <>
              <SparklesIcon className="mr-2 size-4" />
              分类
            </>
          )}
        </Button>
      </CategorizeWithAiButtonTooltip>
      <PremiumModal />
    </>
  );
}

function CategorizeWithAiButtonTooltip({
  children,
  hasAiAccess,
  openPremiumModal,
}: {
  children: ReactElement;
  hasAiAccess: boolean;
  openPremiumModal: () => void;
}) {
  if (hasAiAccess) {
    return (
      <Tooltip content="对大量发件人进行分类，可能需要几分钟。">
        {children}
      </Tooltip>
    );
  }

  return null;
}
