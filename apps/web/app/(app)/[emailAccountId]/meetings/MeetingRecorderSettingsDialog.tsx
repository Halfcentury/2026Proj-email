"use client";

import { useAction } from "next-safe-action/hooks";
import { ListCard } from "@/components/ListCard";
import { RadioCardGroup } from "@/components/RadioCardGroup";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import {
  useMeetingRecorderSettings,
  useMeetingRecorderUpcoming,
} from "@/hooks/useMeetingRecorder";
import { getActionErrorMessage } from "@/utils/error";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import type { UpdateMeetingRecorderSettingsBody } from "@/utils/actions/meeting-recorder.validation";
import { JOIN_RULE_OPTIONS } from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

export function MeetingRecorderSettingsDialog({
  emailAccountId,
  open,
  onClose,
}: {
  emailAccountId: string;
  open: boolean;
  onClose: () => void;
}) {
  // Only mounted inside the page's `settings.enabled` branch, so the settings
  // are already loaded and SWR serves them from cache.
  const { data, mutate } = useMeetingRecorderSettings(emailAccountId);
  const { mutate: mutateUpcoming } = useMeetingRecorderUpcoming(emailAccountId);

  const { execute } = useAction(
    updateMeetingRecorderSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "设置已保存" });
        mutate();
        mutateUpcoming();
      },
      onError: ({ error }) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to save settings",
          }),
        });
      },
    },
  );

  // Paint the change immediately. These controls stay on screen while the
  // action round-trips, so without this the radio and toggles look stuck.
  const save = (update: UpdateMeetingRecorderSettingsBody) => {
    if (data) mutate({ ...data, ...update }, { revalidate: false });
    execute(update);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>会议记录设置</DialogTitle>
        </DialogHeader>

        {data && (
          <div className="space-y-6">
            <div className="space-y-2">
              <ItemTitle>参加的会议范围</ItemTitle>
              <RadioCardGroup
                name="joinRule"
                ariaLabel="参加的会议范围"
                value={data.joinRule}
                onChange={(joinRule) => {
                  save({ joinRule });
                }}
                options={JOIN_RULE_OPTIONS}
              />
            </div>

            <ListCard>
              <Item>
                <ItemContent>
                  <ItemTitle>通过邮件发送笔记</ItemTitle>
                </ItemContent>
                <Toggle
                  name="recapEmailEnabled"
                  ariaLabel="通过邮件发送笔记"
                  enabled={data.recapEmailEnabled}
                  onChange={(recapEmailEnabled) => {
                    save({ recapEmailEnabled });
                  }}
                />
              </Item>

              <Item>
                <ItemContent>
                  <ItemTitle>起草跟进邮件</ItemTitle>
                </ItemContent>
                <Toggle
                  name="followUpDraftEnabled"
                  ariaLabel="起草跟进邮件"
                  enabled={data.followUpDraftEnabled}
                  onChange={(followUpDraftEnabled) => {
                    save({ followUpDraftEnabled });
                  }}
                />
              </Item>
            </ListCard>

            <div className="flex items-center justify-between gap-4">
              <MutedText>取消所有已安排参加的会议。</MutedText>
              <Button
                variant="outline"
                onClick={() => {
                  save({ enabled: false });
                  onClose();
                }}
              >
                关闭
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
