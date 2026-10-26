"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useCalendars } from "@/hooks/useCalendars";
import { useAction } from "next-safe-action/hooks";
import {
  fillMissingTimezoneAction,
  updateEmailAccountTimezoneAction,
} from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  addDismissedPrompt,
  shouldShowTimezonePrompt,
  type DismissedPrompt,
} from "@/components/TimezoneDetector.utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/components/Toast";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { isValidTimeZone } from "@inboxzero/scheduling";

export function TimezoneDetector() {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCalendars();
  const { isAccountOwner } = useOrgAccess();

  const [showDialog, setShowDialog] = useState(false);
  const trackedPromptRef = useRef<string | null>(null);
  const fillAttemptedAccountIdRef = useRef<string | null>(null);
  const [dismissedPrompts, setDismissedPrompts] = useLocalStorage<
    DismissedPrompt[]
  >(`timezone-prompts-dismissed-${emailAccountId}`, []);

  const { execute: executeUpdateTimezone, isExecuting } = useAction(
    updateEmailAccountTimezoneAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "时区已更新！" });
        closeDialog();
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const { execute: executeFillTimezone } = useAction(
    fillMissingTimezoneAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data: result, input }) => {
        if (result?.updated) {
        }
        mutate();
      },
      onError: () => {
        fillAttemptedAccountIdRef.current = null;
      },
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: executeUpdateTimezone is stable from useAction and causes infinite loops if included
  useEffect(() => {
    if (!data || !isAccountOwner) {
      closeDialog();
      return;
    }

    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const savedTimezone = data.timezone;

    if (!isValidTimeZone(currentTimezone)) return;

    if (savedTimezone === null) {
      if (fillAttemptedAccountIdRef.current === emailAccountId) return;
      fillAttemptedAccountIdRef.current = emailAccountId;
      executeFillTimezone({ timezone: currentTimezone });
      return;
    }

    if (
      shouldShowTimezonePrompt(savedTimezone, currentTimezone, dismissedPrompts)
    ) {
      setShowDialog(true);

      const promptKey = `${savedTimezone}:${currentTimezone}`;
      if (trackedPromptRef.current !== promptKey) {
        trackedPromptRef.current = promptKey;
      }
    }
  }, [data, dismissedPrompts, isAccountOwner]);

  const handleUpdateTimezone = () => {
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    executeUpdateTimezone({ timezone: currentTimezone });
  };

  const handleKeepCurrent = () => {
    // Remember this choice so we don't ask again for this timezone combination (for 30 days)
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (data?.timezone) {
      const updated = addDismissedPrompt(
        dismissedPrompts,
        data.timezone,
        currentTimezone,
      );
      setDismissedPrompts(updated);
    }
    closeDialog();
  };

  const closeDialog = () => {
    setShowDialog(false);
    trackedPromptRef.current = null;
  };

  if (!data?.timezone) {
    return null;
  }

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Dialog
      open={showDialog}
      onOpenChange={(open) => {
        if (!open) handleKeepCurrent();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>检测到时区变化</DialogTitle>
          <DialogDescription>
            已保存的时区： <strong>{data.timezone}</strong>，检测到当前时区：{" "}
            <strong>{detectedTimezone}</strong>
            。更新后，可预约时间和预约链接也将使用此时区。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleKeepCurrent}
            disabled={isExecuting}
          >
            保留当前设置
          </Button>
          <Button onClick={handleUpdateTimezone} loading={isExecuting}>
            更新为 {detectedTimezone}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
