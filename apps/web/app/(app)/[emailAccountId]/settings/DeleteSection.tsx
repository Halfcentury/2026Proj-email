"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteAccountAction } from "@/utils/actions/user";
import { logOut } from "@/utils/user";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();
  const hasSubscription = false;
  const hasAppleSubscription = false;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConfirmedCancellation, setHasConfirmedCancellation] =
    useState(false);

  const { executeAsync: executeDeleteAccount } = useAction(
    deleteAccountAction.bind(null),
  );

  const handleDeleteAccount = async () => {
    onCancelLoadBatch();
    setIsDialogOpen(false);

    toast.promise(
      async () => {
        const result = await executeDeleteAccount();
        await logOut("/");
        if (result?.serverError) throw new Error(result.serverError);
      },
      {
        loading: "正在删除账户…",
        success: "账户已删除！",
        error: (err: unknown) =>
          `删除账户失败：${err instanceof Error ? err.message : "未知错误"}`,
      },
    );
  };

  const handleConfirmCancellation = () => {
    setHasConfirmedCancellation(true);
  };

  const shouldBlockDeletion = hasSubscription && !hasConfirmedCancellation;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>删除账户</ItemTitle>
        <ItemDescription>永久删除账户及全部数据。</ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructiveSoft" size="sm">
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {shouldBlockDeletion ? "请先取消订阅" : "确定继续吗？"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  {shouldBlockDeletion ? (
                    <>
                      <p className="mb-3">删除账户前请先取消订阅。</p>
                      <p className="mb-3">
                        {hasAppleSubscription ? (
                          <>可在 iPhone 或 iPad 的订阅设置中管理订阅。</>
                        ) : (
                          <>
                            可点击上方“管理订阅”，或前往{" "}
                            <Link
                              href="/premium"
                              className="text-blue-600 underline hover:text-blue-800"
                              onClick={() => setIsDialogOpen(false)}
                            >
                              套餐页面
                            </Link>{" "}
                            并点击“管理订阅”。
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        已取消订阅？点击下方按钮继续。
                      </p>
                    </>
                  ) : (
                    <p>此操作无法撤销，将永久删除用户及全部关联账户。</p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              {shouldBlockDeletion ? (
                <AlertDialogAction onClick={handleConfirmCancellation}>
                  我已取消订阅
                </AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={handleDeleteAccount}>
                  删除账户
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}
