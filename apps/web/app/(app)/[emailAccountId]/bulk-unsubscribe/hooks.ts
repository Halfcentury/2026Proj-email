"use client";

import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import { useAction } from "next-safe-action/hooks";
import { toastSuccess } from "@/components/Toast";
import {
  setSenderStatusAction,
  unsubscribeSenderAction,
} from "@/utils/actions/unsubscriber";
import { NewsletterStatus } from "@/generated/prisma/enums";
import {
  assertActionSucceeded,
  captureException,
  EmailProviderRateLimitError,
} from "@/utils/error";
import {
  addToArchiveSenderThreadQueue,
  useArchiveSenderQueueActions,
} from "@/store/archive-sender-queue";
import type {
  NewsletterFilterType,
  Row,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import type { UserResponse } from "@/app/api/user/me/route";
import {
  bulkArchiveAction,
  bulkTrashAction,
} from "@/utils/actions/mail-bulk-action";
import {
  getHttpUnsubscribeLink,
  getUserFacingUnsubscribeLink,
} from "@/utils/parse/unsubscribe";
import { fetchAllSenderThreads } from "@/store/fetch-sender-threads";
import { enqueueThreadMailMutationBatch } from "@/utils/mail-engine/thread-mail-mutations";

// Shared type for SWR mutate function
type MutateFn = (
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  data?: any,
  opts?: { revalidate?: boolean },
) => Promise<unknown>;

type QueueArchiveSendersFn = (params: { senders: string[] }) => Promise<number>;

type BulkOperationResult = {
  stoppedByRateLimit: boolean;
  total: number;
  successCount: number;
  failureCount: number;
};

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function formatSenderNames<T extends Row>(items: T[]): string {
  const names = items.map((item) => item.name);
  return names.length > 3
    ? `${names.slice(0, 3).join(", ")}...`
    : names.join(", ");
}

function itemMatchesFilter(
  status: NewsletterStatus | null | undefined,
  filter: NewsletterFilterType,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unhandled":
      return !status; // null/undefined status means unhandled
    case "unsubscribed":
      return status === NewsletterStatus.UNSUBSCRIBED;
    case "autoArchived":
      return status === NewsletterStatus.AUTO_ARCHIVED;
    case "approved":
      return status === NewsletterStatus.APPROVED;
    default:
      return true;
  }
}

// Generic bulk operation handler to reduce duplication
async function executeBulkOperation<T extends Row>({
  items,
  mutate,
  filter,
  onDeselectItem,
  processItem,
  newStatus,
  getNewStatus,
  loadingMessage,
  successMessage,
  errorMessage,
  onComplete,
  onCompleteRevalidates,
  onSuccess,
}: {
  items: T[];
  mutate: MutateFn;
  filter: NewsletterFilterType;
  onDeselectItem?: (id: string) => void;
  processItem: (item: T) => Promise<void>;
  newStatus: NewsletterStatus | null;
  getNewStatus?: (item: T) => NewsletterStatus | null;
  loadingMessage: string;
  successMessage: string;
  errorMessage: string;
  onComplete?: () => Promise<unknown>;
  onCompleteRevalidates?: boolean;
  onSuccess?: () => void;
}): Promise<BulkOperationResult> {
  const total = items.length;
  const toastId = toast.loading(
    `${loadingMessage} ${total} ${pluralize(total, "sender")}...`,
    { description: `已完成 0 / ${total}` },
  );

  let completed = 0;
  let failureCount = 0;
  let rateLimitError: EmailProviderRateLimitError | undefined;

  const updateItemOptimistically = (item: T) => {
    const optimisticStatus = getNewStatus ? getNewStatus(item) : newStatus;
    mutate(
      // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
      (currentData: any) => {
        if (!currentData?.newsletters) return currentData;
        return {
          ...currentData,
          newsletters: currentData.newsletters
            // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
            .map((n: any) =>
              n.name === item.name ? { ...n, status: optimisticStatus } : n,
            )
            // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
            .filter((n: any) => itemMatchesFilter(n.status, filter)),
        };
      },
      { revalidate: false },
    );
  };

  for (const item of items) {
    updateItemOptimistically(item);

    try {
      await processItem(item);
      onDeselectItem?.(item.name);
    } catch (error) {
      failureCount++;
      if (error instanceof EmailProviderRateLimitError) {
        rateLimitError = error;
      } else if (!(error instanceof AutomaticUnsubscribeFailedError)) {
        captureException(error);
      }
    } finally {
      completed++;
      toast.loading(
        `${loadingMessage} ${total} ${pluralize(total, "sender")}...`,
        {
          id: toastId,
          description: `已完成 ${completed} / ${total}`,
        },
      );
    }

    if (rateLimitError) break;
  }

  let didRevalidateOnComplete = false;
  if (onComplete) {
    try {
      await onComplete();
      didRevalidateOnComplete = onCompleteRevalidates === true;
    } catch (error) {
      captureException(error);
    }
  }

  if (rateLimitError) {
    if (!didRevalidateOnComplete) await mutate();
    const successful = completed - failureCount;
    toast.error(rateLimitError.message, {
      id: toastId,
      description: `已完成 ${successful} / ${total}；为避免继续请求，已停止`,
    });
    return {
      stoppedByRateLimit: true,
      total,
      successCount: successful,
      failureCount,
    };
  }

  if (failureCount > 0) {
    await mutate();
    toast.error(
      `${errorMessage} ${failureCount} ${pluralize(failureCount, "sender")}`,
      {
        id: toastId,
        description: `成功 ${total - failureCount} / ${total}`,
      },
    );
  } else {
    toast.success(`${total} ${pluralize(total, "sender")} ${successMessage}`, {
      id: toastId,
      description: undefined,
    });
    onSuccess?.();
  }

  return {
    stoppedByRateLimit: false,
    total,
    successCount: total - failureCount,
    failureCount,
  };
}

async function unsubscribeAndArchive({
  senderEmail,
  unsubscribeLink,
  mutate,
  refetchPremium,
  emailAccountId,
  queueArchiveSenders,
  archiveExisting,
}: {
  senderEmail: string;
  unsubscribeLink?: string | null;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  queueArchiveSenders: QueueArchiveSendersFn;
  archiveExisting: boolean;
}) {
  const unsubscribed = await performAutomaticUnsubscribe({
    emailAccountId,
    senderEmail,
    unsubscribeLink,
  });
  if (!unsubscribed) return false;

  await mutate();
  if (archiveExisting) await queueArchiveSenders({ senders: [senderEmail] });
  await refreshPremium(refetchPremium);

  return true;
}

async function blockSender({
  sender,
  emailAccountId,
  labelId,
  labelName,
  queueArchiveSenders,
}: {
  sender: string;
  emailAccountId: string;
  labelId?: string;
  labelName?: string;
  queueArchiveSenders: QueueArchiveSendersFn;
}) {
  const statusResult = await setSenderStatusAction(emailAccountId, {
    senderEmail: sender,
    status: NewsletterStatus.AUTO_ARCHIVED,
    labelId,
    labelName,
  });
  assertActionSucceeded(statusResult);

  if (labelId) {
    await addToArchiveSenderThreadQueue({
      sender,
      labelId,
      emailAccountId,
    });
  } else {
    await queueArchiveSenders({ senders: [sender] });
  }
}

export function useUnsubscribe<T extends Row>({
  item,
  emailAccountId,
  hasUnsubscribeAccess,
  mutate,

  refetchPremium,
}: {
  item: T;
  emailAccountId: string;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;

  refetchPremium: () => Promise<UserResponse | null | undefined>;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = useState(false);
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);
  const [archiveOnUnsubscribe] = useArchiveOnUnsubscribe();
  const automaticUnsubscribeLink = getAutomaticUnsubscribeLink(
    item.unsubscribeLink,
  );
  const userFacingUnsubscribeLink = getManualUnsubscribeLink(
    item.unsubscribeLink,
  );

  const onUnsubscribe = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setUnsubscribeLoading(true);

    // However the attempt fails, the sender's own page stays available, so the
    // reader is never left without a way to finish.
    const openPageAction = userFacingUnsubscribeLink
      ? {
          label: "打开页面",
          onClick: () =>
            window.open(
              userFacingUnsubscribeLink,
              "_blank",
              "noopener,noreferrer",
            ),
        }
      : undefined;

    try {
      if (item.status === NewsletterStatus.UNSUBSCRIBED) {
        const statusResult = await setSenderStatusAction(emailAccountId, {
          senderEmail: item.name,
          status: null,
        });
        assertActionSucceeded(statusResult);
        await mutate();
      } else {
        if (!userFacingUnsubscribeLink) {
          await blockSender({
            sender: item.name,
            emailAccountId,
            queueArchiveSenders,
          });

          toastSuccess({
            description: "已拦截发件人，后续邮件将自动归档。",
          });
          await mutate();
          await refreshPremium(refetchPremium);
          return;
        }

        if (!automaticUnsubscribeLink) return;

        const unsubscribed = await unsubscribeAndArchive({
          senderEmail: item.name,
          unsubscribeLink: item.unsubscribeLink,
          mutate,
          refetchPremium,
          emailAccountId,
          queueArchiveSenders,
          archiveExisting: archiveOnUnsubscribe,
        });
        if (!unsubscribed) {
          toast.error(`无法退订 ${item.name}`, {
            action: openPageAction,
          });
        } else {
        }
      }
    } catch (error) {
      if (error instanceof EmailProviderRateLimitError) {
        toast.error(error.message, { action: openPageAction });
      } else {
        captureException(error);
        toast.error(`无法退订 ${item.name}`, {
          action: openPageAction,
        });
      }
    } finally {
      setUnsubscribeLoading(false);
    }
  }, [
    hasUnsubscribeAccess,
    item.name,
    item.status,
    item.unsubscribeLink,
    automaticUnsubscribeLink,

    mutate,
    refetchPremium,

    emailAccountId,
    userFacingUnsubscribeLink,
    queueArchiveSenders,
    archiveOnUnsubscribe,
  ]);

  return {
    unsubscribeLoading,
    onUnsubscribe,
    // Only meaningful without an automatic link: the caller navigates to it
    // instead of unsubscribing in place.
    hasAutomaticUnsubscribe: Boolean(
      hasUnsubscribeAccess && automaticUnsubscribeLink,
    ),
    unsubscribeLink:
      hasUnsubscribeAccess && userFacingUnsubscribeLink
        ? userFacingUnsubscribeLink
        : "#",
  };
}

export function useBulkUnsubscribe<T extends Row>({
  hasUnsubscribeAccess,
  mutate,

  refetchPremium,
  emailAccountId,
  onDeselectItem,
  filter,
  onSuccess,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: MutateFn;

  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
  onSuccess?: (items: T[]) => void;
}) {
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);
  const [archiveOnUnsubscribe] = useArchiveOnUnsubscribe();

  const onBulkUnsubscribe = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) {
        return {
          stoppedByRateLimit: false,
          total: items.length,
          successCount: 0,
          failureCount: items.length,
        };
      }

      const messages = getBulkUnsubscribeMessages(items);

      const result = await executeBulkOperation({
        items,
        mutate,
        filter,
        onDeselectItem,
        newStatus: NewsletterStatus.UNSUBSCRIBED,
        getNewStatus: (item) =>
          getAutomaticUnsubscribeLink(item.unsubscribeLink)
            ? NewsletterStatus.UNSUBSCRIBED
            : NewsletterStatus.AUTO_ARCHIVED,
        ...messages,
        processItem: async (item) => {
          if (!getAutomaticUnsubscribeLink(item.unsubscribeLink)) {
            await blockSender({
              sender: item.name,
              emailAccountId,
              queueArchiveSenders,
            });
            return;
          }

          const unsubscribed = await performAutomaticUnsubscribe({
            emailAccountId,
            senderEmail: item.name,
            unsubscribeLink: item.unsubscribeLink,
          });
          if (!unsubscribed) {
            throw new AutomaticUnsubscribeFailedError();
          }
          if (archiveOnUnsubscribe) {
            await queueArchiveSenders({ senders: [item.name] });
          }
        },
        onComplete: async () => {
          await mutate();
          await refreshPremium(refetchPremium);
        },
        onCompleteRevalidates: true,
        onSuccess: () => onSuccess?.(items),
      });
      if (result.stoppedByRateLimit) return;

      return result;
    },
    [
      hasUnsubscribeAccess,
      mutate,

      refetchPremium,
      emailAccountId,
      onDeselectItem,
      filter,

      queueArchiveSenders,
      archiveOnUnsubscribe,
      onSuccess,
    ],
  );

  return { onBulkUnsubscribe };
}

async function autoArchive({
  name,
  labelId,
  labelName,
  mutate,
  refetchPremium,
  emailAccountId,
  queueArchiveSenders,
}: {
  name: string;
  labelId: string | undefined;
  labelName: string | undefined;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  queueArchiveSenders: QueueArchiveSendersFn;
}) {
  await blockSender({
    sender: name,
    emailAccountId,
    labelId,
    labelName,
    queueArchiveSenders,
  });
  toastSuccess({ description: "自动归档已启用！" });
  await mutate();
  await refreshPremium(refetchPremium);
}

export function useAutoArchive<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,

  refetchPremium,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;

  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
}) {
  const [autoArchiveLoading, setAutoArchiveLoading] = useState(false);
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);

  const onAutoArchiveClick = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setAutoArchiveLoading(true);

    try {
      await autoArchive({
        name: item.name,
        labelId: undefined,
        labelName: undefined,
        mutate,
        refetchPremium,
        emailAccountId,
        queueArchiveSenders,
      });
    } catch (error) {
      captureException(error);
      toast.error("启用自动归档失败");
    } finally {
      setAutoArchiveLoading(false);
    }
  }, [
    item.name,
    mutate,
    refetchPremium,
    hasUnsubscribeAccess,

    emailAccountId,
    queueArchiveSenders,
  ]);

  const onDisableAutoArchive = useCallback(async () => {
    setAutoArchiveLoading(true);

    try {
      const statusResult = await setSenderStatusAction(emailAccountId, {
        senderEmail: item.name,
        status: null,
      });
      assertActionSucceeded(statusResult);
      toastSuccess({ description: "自动归档已关闭！" });
      await mutate();
    } catch (error) {
      captureException(error);
      toast.error("关闭自动归档失败");
    } finally {
      setAutoArchiveLoading(false);
    }
  }, [item.name, mutate, emailAccountId]);

  const onAutoArchiveAndLabel = useCallback(
    async (labelId: string, labelName: string) => {
      if (!hasUnsubscribeAccess) return;

      setAutoArchiveLoading(true);

      try {
        await autoArchive({
          name: item.name,
          labelId,
          labelName,
          mutate,
          refetchPremium,
          emailAccountId,
          queueArchiveSenders,
        });
      } catch (error) {
        captureException(error);
        toast.error("启用自动归档失败");
      } finally {
        setAutoArchiveLoading(false);
      }
    },
    [
      item.name,
      mutate,
      refetchPremium,
      hasUnsubscribeAccess,
      emailAccountId,
      queueArchiveSenders,
    ],
  );

  return {
    autoArchiveLoading,
    onAutoArchive: onAutoArchiveClick,
    onDisableAutoArchive,
    onAutoArchiveAndLabel,
  };
}

export function useBulkAutoArchive<T extends Row>({
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  emailAccountId,
  onDeselectItem,
  filter,
}: {
  hasUnsubscribeAccess: boolean;
  mutate: MutateFn;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
}) {
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);

  const onBulkAutoArchive = useCallback(
    async (items: T[]) => {
      if (!hasUnsubscribeAccess) return;

      await executeBulkOperation({
        items,
        mutate,
        filter,
        onDeselectItem,
        newStatus: NewsletterStatus.AUTO_ARCHIVED,
        loadingMessage: "正在设置自动归档：",
        successMessage: "已设置为自动归档",
        errorMessage: "设置自动归档失败：",
        processItem: async (item) => {
          await blockSender({
            sender: item.name,
            emailAccountId,
            queueArchiveSenders,
          });
        },
        onComplete: refetchPremium,
      });
    },
    [
      hasUnsubscribeAccess,
      mutate,
      refetchPremium,
      emailAccountId,
      onDeselectItem,
      filter,
      queueArchiveSenders,
    ],
  );

  return { onBulkAutoArchive };
}

export function useApproveButton<T extends Row>({
  item,
  mutate,

  emailAccountId,
  filter,
}: {
  item: T;
  mutate: (
    // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
    data?: any,
    opts?: {
      revalidate?: boolean;
      // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
      optimisticData?: any;
      rollbackOnError?: boolean;
    },
  ) => Promise<void>;

  emailAccountId: string;
  filter: NewsletterFilterType;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<
    NewsletterStatus | null | undefined
  >(undefined);

  // Reset optimistic state when item.status changes (after mutate)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when item.status changes
  useEffect(() => {
    setOptimisticStatus(undefined);
  }, [item.status]);

  const onApprove = async () => {
    const previousStatus = item.status;
    const newStatus =
      item.status === NewsletterStatus.APPROVED
        ? null
        : NewsletterStatus.APPROVED;

    // Optimistically update the UI
    setOptimisticStatus(newStatus);

    // Optimistically update status and filter out items that no longer match the current view
    // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
    const optimisticUpdate = (currentData: any) => {
      if (!currentData?.newsletters) return currentData;
      return {
        ...currentData,
        newsletters: currentData.newsletters
          // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
          .map((n: any) =>
            n.name === item.name ? { ...n, status: newStatus } : n,
          )
          // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
          .filter((n: any) => itemMatchesFilter(n.status, filter)),
      };
    };

    // Show toast optimistically
    if (newStatus === NewsletterStatus.APPROVED) {
      toast.success("已保留发件人", {
        description: item.name,
      });
    } else {
      toast.success("已将发件人移至待审核", {
        description: item.name,
      });
    }

    // Start optimistic update immediately (don't await - fire and forget for UI)
    mutate(optimisticUpdate, { revalidate: false });

    try {
      // Also removes any existing auto-archive filter for the sender
      const result = await setSenderStatusAction(emailAccountId, {
        senderEmail: item.name,
        status: newStatus,
      });
      assertActionSucceeded(result);
      // Don't revalidate - the optimistic update is correct
    } catch (error) {
      // Revert on error by revalidating
      setOptimisticStatus(previousStatus);
      await mutate();
      captureException(error);
      toast.error("更新发件人状态失败");
    }
  };

  // Use optimistic status if set, otherwise use the actual item status
  const displayStatus =
    optimisticStatus !== undefined ? optimisticStatus : item.status;

  return {
    approveLoading: false,
    onApprove,
    isApproved: displayStatus === NewsletterStatus.APPROVED,
  };
}

export function useBulkApprove<T extends Row>({
  mutate,

  emailAccountId,
  onDeselectItem,
  filter,
}: {
  mutate: MutateFn;

  emailAccountId: string;
  onDeselectItem?: (id: string) => void;
  filter: NewsletterFilterType;
}) {
  const onBulkApprove = async (items: T[], unapprove?: boolean) => {
    const newStatus = unapprove ? null : NewsletterStatus.APPROVED;
    const actionPast = unapprove ? "moved to review" : "kept";

    await executeBulkOperation({
      items,
      mutate,
      filter,
      onDeselectItem,
      newStatus,
      loadingMessage: unapprove ? "Moving to review" : "Keeping",
      successMessage: actionPast,
      errorMessage: `操作失败：${unapprove ? "move to review" : "keep"}`,
      processItem: async (item) => {
        const result = await setSenderStatusAction(emailAccountId, {
          senderEmail: item.name,
          status: newStatus,
        });
        assertActionSucceeded(result);
      },
    });
  };

  return { onBulkApprove };
}

export function useBulkArchive<T extends Row>({
  emailAccountId,
  mutate,
}: {
  emailAccountId: string;
  mutate?: MutateFn;
}) {
  const { executeAsync: executeBulkArchive, isExecuting } = useAction(
    bulkArchiveAction.bind(null, emailAccountId),
  );

  const onBulkArchive = (items: T[]) => {
    const promise = executeBulkArchive({
      froms: items.map((item) => item.name),
    }).then(async (result) => {
      if (result?.serverError) {
        throw new Error(result.serverError);
      }

      await mutate?.(undefined, { revalidate: true });
      return result;
    });

    const displayNames = formatSenderNames(items);

    toast.promise(promise, {
      loading: `正在归档来自 ${displayNames} 的邮件…`,
      success: () => `已归档来自 ${displayNames} 的邮件`,
      error: (error: unknown) =>
        getBulkActionErrorMessage(
          error,
          "There was an error archiving the emails",
        ),
    });
  };

  return { onBulkArchive, isBulkArchiving: isExecuting };
}

async function deleteAllFromSender({
  name,
  onFinish,
  emailAccountId,
}: {
  name: string;
  onFinish: () => void;
  emailAccountId: string;
}) {
  const deletion = (async () => {
    const { threads } = await fetchAllSenderThreads({
      sender: name,
      emailAccountId,
    });
    if (threads.length) {
      await enqueueThreadMailMutationBatch({
        emailAccountId,
        payload: { kind: "trash" },
        threads,
      });
    }
    return threads.length;
  })();

  toast.promise(deletion, {
    loading: `正在删除来自 ${name} 的全部邮件`,
    success: (count: number) =>
      count
        ? `已将来自 ${name} 的 ${count} 封邮件加入删除队列`
        : `没有来自 ${name} 的可删除邮件`,
    error: `删除来自 ${name} 的邮件失败。`,
  });

  try {
    return await deletion;
  } finally {
    onFinish();
  }
}

export function useDeleteAllFromSender<T extends Row>({
  item,

  emailAccountId,
}: {
  item: T;

  emailAccountId: string;
}) {
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  const onDeleteAll = async () => {
    setDeleteAllLoading(true);

    try {
      await deleteAllFromSender({
        name: item.name,
        onFinish: () => setDeleteAllLoading(false),
        emailAccountId,
      });
    } catch (error) {
      captureException(error);
    }
  };

  return {
    deleteAllLoading,
    onDeleteAll,
  };
}

export function useBulkDelete<T extends Row>({
  mutate,

  emailAccountId,
}: {
  mutate: () => Promise<unknown>;

  emailAccountId: string;
}) {
  const { executeAsync: executeBulkTrash, isExecuting } = useAction(
    bulkTrashAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
    },
  );

  const onBulkDelete = (items: T[]) => {
    const promise = executeBulkTrash({ froms: items.map((item) => item.name) });

    const displayNames = formatSenderNames(items);

    toast.promise(promise, {
      loading: `正在删除来自 ${displayNames} 的邮件…`,
      success: `已删除来自 ${displayNames} 的邮件`,
      error: (error: unknown) =>
        getBulkActionErrorMessage(
          error,
          "There was an error trashing the emails",
        ),
    });
  };

  return { onBulkDelete, isBulkDeleting: isExecuting };
}

export function useBulkUnsubscribeShortcuts<T extends Row>({
  newsletters,
  selectedRow,
  onOpenNewsletter,
  setSelectedRow,
  refetchPremium,
  hasUnsubscribeAccess,
  mutate,
  emailAccountId,
  // userEmail,
}: {
  newsletters?: T[];
  selectedRow?: T;
  setSelectedRow: (row: T) => void;
  onOpenNewsletter: (row: T) => void;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  hasUnsubscribeAccess: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  mutate: () => Promise<any>;
  emailAccountId: string;
  userEmail: string;
}) {
  const { queueArchiveSenders } = useArchiveSenderQueueActions(emailAccountId);
  const [archiveOnUnsubscribe] = useArchiveOnUnsubscribe();

  // perform actions using keyboard shortcuts
  // TODO make this available to command-K dialog too
  useEffect(() => {
    const down = async (e: KeyboardEvent) => {
      try {
        const item = selectedRow;
        if (!item) return;

        // to prevent when typing in an input such as Crisp support
        if (document?.activeElement?.tagName !== "BODY") return;

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const index = newsletters?.findIndex((n) => n.name === item.name);
          if (index === undefined) return;
          const nextItem =
            newsletters?.[index + (e.key === "ArrowDown" ? 1 : -1)];
          if (!nextItem) return;
          setSelectedRow(nextItem);
          return;
        }
        if (e.key === "Enter") {
          // open modal
          e.preventDefault();
          onOpenNewsletter(item);
          return;
        }

        if (!hasUnsubscribeAccess) return;

        if (e.key === "e") {
          // auto archive
          e.preventDefault();
          const statusResult = await setSenderStatusAction(emailAccountId, {
            senderEmail: item.name,
            status: NewsletterStatus.AUTO_ARCHIVED,
          });
          assertActionSucceeded(statusResult);
          toastSuccess({ description: "自动归档已启用！" });
          await mutate();
          await refreshPremium(refetchPremium);
          return;
        }
        if (e.key === "u") {
          // unsubscribe
          e.preventDefault();
          const automaticUnsubscribeLink = getAutomaticUnsubscribeLink(
            item.unsubscribeLink,
          );
          const userFacingUnsubscribeLink = getManualUnsubscribeLink(
            item.unsubscribeLink,
          );

          if (!userFacingUnsubscribeLink) {
            await blockSender({
              sender: item.name,
              emailAccountId,
              queueArchiveSenders,
            });
            toastSuccess({
              description: "已拦截发件人，后续邮件将自动归档。",
            });
            await mutate();
            await refreshPremium(refetchPremium);
            return;
          }

          if (!automaticUnsubscribeLink) {
            window.open(
              userFacingUnsubscribeLink,
              "_blank",
              "noopener,noreferrer",
            );
            return;
          }

          const unsubscribed = await unsubscribeAndArchive({
            senderEmail: item.name,
            unsubscribeLink: item.unsubscribeLink,
            mutate,
            refetchPremium,
            emailAccountId,
            queueArchiveSenders,
            archiveExisting: archiveOnUnsubscribe,
          });
          if (!unsubscribed) return;
          return;
        }
        if (e.key === "a") {
          // approve
          e.preventDefault();
          const statusResult = await setSenderStatusAction(emailAccountId, {
            senderEmail: item.name,
            status: NewsletterStatus.APPROVED,
          });
          assertActionSucceeded(statusResult);
          await mutate();
          return;
        }
      } catch (error) {
        captureException(error);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [
    mutate,
    newsletters,
    selectedRow,
    hasUnsubscribeAccess,
    refetchPremium,
    setSelectedRow,
    onOpenNewsletter,
    emailAccountId,
    queueArchiveSenders,
    archiveOnUnsubscribe,
  ]);
}

export function useArchiveOnUnsubscribe() {
  // Read after mount so a saved `false` doesn't mismatch the server render.
  return useLocalStorage("bulk-unsubscribe-archive-on-unsubscribe", true, {
    initializeWithValue: false,
  });
}

export function useNewsletterFilter() {
  const [filter, setFilter] = useState<NewsletterFilterType>("unhandled");

  // Convert single filter to array format for API compatibility
  const filtersArray: (
    | "unhandled"
    | "unsubscribed"
    | "autoArchived"
    | "approved"
  )[] =
    filter === "all"
      ? ["unhandled", "unsubscribed", "autoArchived", "approved"]
      : [filter];

  return {
    filter,
    filtersArray,
    setFilter,
  };
}

function didAutomaticUnsubscribeSucceed(
  result: Awaited<ReturnType<typeof unsubscribeSenderAction>>,
) {
  if (result?.serverError) {
    assertActionSucceeded({ serverError: result.serverError });
  }

  return result?.data?.unsubscribe.success === true;
}

async function performAutomaticUnsubscribe({
  emailAccountId,
  senderEmail,
  unsubscribeLink,
}: {
  emailAccountId: string;
  senderEmail: string;
  unsubscribeLink?: string | null;
}) {
  const unsubscribeResult = await unsubscribeSenderAction(emailAccountId, {
    senderEmail,
    unsubscribeLink,
  });

  return didAutomaticUnsubscribeSucceed(unsubscribeResult);
}

function getAutomaticUnsubscribeLink(unsubscribeLink?: string | null) {
  return getHttpUnsubscribeLink({
    unsubscribeLink,
  });
}

function getManualUnsubscribeLink(unsubscribeLink?: string | null) {
  return getUserFacingUnsubscribeLink({
    unsubscribeLink,
  });
}

function getBulkUnsubscribeMessages<T extends Row>(items: T[]) {
  const hasAutomatic = items.some((item) =>
    getAutomaticUnsubscribeLink(item.unsubscribeLink),
  );
  const hasBlock = items.some(
    (item) => !getAutomaticUnsubscribeLink(item.unsubscribeLink),
  );

  if (hasAutomatic && hasBlock) {
    return {
      loadingMessage: "正在处理",
      successMessage: "processed",
      errorMessage: "处理失败",
    };
  }
  if (hasBlock) {
    return {
      loadingMessage: "Blocking",
      successMessage: "blocked",
      errorMessage: "拦截失败",
    };
  }
  return {
    loadingMessage: "正在退订",
    successMessage: "unsubscribed",
    errorMessage: "退订失败：",
  };
}

/**
 * A stale premium count is cosmetic, so refreshing it must never turn an
 * operation that already succeeded into a failure toast.
 */
async function refreshPremium(
  refetchPremium: () => Promise<UserResponse | null | undefined>,
) {
  try {
    await refetchPremium();
  } catch (error) {
    captureException(error);
  }
}

function getBulkActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    error.error &&
    typeof error.error === "object" &&
    "serverError" in error.error &&
    typeof error.error.serverError === "string"
  ) {
    return error.error.serverError;
  }

  return fallback;
}

// An expected outcome (the sender's endpoint rejected or needs a person), not
// a bug: the server logs the reason and the toast reports the failure count.
class AutomaticUnsubscribeFailedError extends Error {
  constructor() {
    super("Automatic unsubscribe did not succeed");
    this.name = "AutomaticUnsubscribeFailedError";
  }
}
