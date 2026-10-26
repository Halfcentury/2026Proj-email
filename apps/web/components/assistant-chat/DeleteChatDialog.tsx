"use client";

import { useAction } from "next-safe-action/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { deleteChatAction } from "@/utils/actions/chat";
import { getActionErrorMessage } from "@/utils/error";

export function DeleteChatDialog({
  open,
  onOpenChange,
  chatId,
  label,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  label: string;
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { execute, isExecuting } = useAction(
    deleteChatAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "对话已删除。" });
        onDeleted();
        onOpenChange(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to delete chat",
          }),
        });
      },
    },
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除对话？</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{label}
            ”将从对话历史中移除，消息内容会被清除。此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              execute({ chatId });
            }}
            disabled={isExecuting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isExecuting ? "正在删除…" : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
