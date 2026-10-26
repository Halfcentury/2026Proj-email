"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  EyeIcon,
  MoreHorizontalIcon,
  TagIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "lucide-react";
import type { UserResponse } from "@/app/api/user/me/route";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction, deleteFilterAction } from "@/utils/actions/mail";
import { setSenderStatusAction } from "@/utils/actions/unsubscriber";
import { assertActionSucceeded, captureException } from "@/utils/error";
import { getGmailFilterSettingsUrl, getGmailSearchUrl } from "@/utils/url";
import { extractNameFromEmail } from "@/utils/email";
import { Badge } from "@/components/ui/badge";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useApproveButton,
  useBulkArchive,
  useBulkDelete,
  useBulkAutoArchive,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { ResubscribeDialog } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ResubscribeDialog";
import { LabelsSubMenu } from "@/components/LabelsSubMenu";
import type { EmailLabel } from "@/providers/email-label-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getEmailTerminology } from "@/utils/terminology";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";

export function ActionCell<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  onOpenNewsletter,
  labels,
  openPremiumModal,
  userEmail,
  emailAccountId,
  filter,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  onOpenNewsletter?: (row: T) => void;
  selected: boolean;
  labels: EmailLabel[];
  openPremiumModal: () => void;
  userEmail: string;
  emailAccountId: string;
  filter: NewsletterFilterType;
}) {
  const status = item.status ? senderStatusBadges[item.status] : undefined;

  return (
    <>
      {status ? (
        <>
          <Badge variant={status.variant} size="sm" className="h-6">
            {status.label}
          </Badge>
          {item.status === NewsletterStatus.UNSUBSCRIBED ? (
            <UnsubscribeButton
              item={item}
              hasUnsubscribeAccess={hasUnsubscribeAccess}
              mutate={mutate}
              refetchPremium={refetchPremium}
              emailAccountId={emailAccountId}
            />
          ) : (
            <MoveToReviewButton
              item={item}
              mutate={mutate}
              emailAccountId={emailAccountId}
            />
          )}
        </>
      ) : (
        <>
          <ApproveButton
            item={item}
            hasUnsubscribeAccess={hasUnsubscribeAccess}
            mutate={mutate}
            emailAccountId={emailAccountId}
            filter={filter}
          />
          {null}
        </>
      )}
      <MoreDropdown
        onOpenNewsletter={onOpenNewsletter}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        labels={labels}
        mutate={mutate}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        filter={filter}
        openPremiumModal={openPremiumModal}
      />
    </>
  );
}

function UnsubscribeButton<T extends Row>({
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
  const [resubscribeDialogOpen, setResubscribeDialogOpen] = useState(false);

  const {
    unsubscribeLoading,
    onUnsubscribe,
    unsubscribeLink,
    hasAutomaticUnsubscribe,
  } = useUnsubscribe({
    item,
    hasUnsubscribeAccess,
    mutate,

    refetchPremium,
    emailAccountId,
  });

  const hasUnsubscribeLink = unsubscribeLink !== "#";
  const isUnsubscribed = item.status === NewsletterStatus.UNSUBSCRIBED;

  const buttonText = isUnsubscribed
    ? "Resubscribe"
    : hasUnsubscribeLink
      ? "Unsubscribe"
      : "Block";

  const senderName = item.fromName || extractNameFromEmail(item.name);

  const isBlock = !isUnsubscribed && !hasUnsubscribeLink;
  const buttonClassName = cn(
    "w-[120px] justify-center",
    isBlock && "border-dashed",
  );
  const buttonContent = (
    <>
      {unsubscribeLoading ? (
        <ButtonLoader />
      ) : (
        isBlock && <BanIcon className="mr-1.5 size-4 text-muted-foreground" />
      )}
      {buttonText}
    </>
  );

  // Show Resubscribe button if unsubscribed, otherwise show Unsubscribe/Block button
  const button =
    isUnsubscribed || resubscribeDialogOpen ? (
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setResubscribeDialogOpen(true)}
      >
        {unsubscribeLoading && <ButtonLoader />}
        重新订阅
      </Button>
    ) : hasAutomaticUnsubscribe ? (
      // Unsubscribing happens here, so opening the sender's page would only
      // hand the reader work we are about to do for them.
      <Button
        size="sm"
        variant="outline"
        className={buttonClassName}
        onClick={onUnsubscribe}
        disabled={unsubscribeLoading}
      >
        {buttonContent}
      </Button>
    ) : (
      <Button size="sm" variant="outline" className={buttonClassName} asChild>
        <Link
          href={unsubscribeLink}
          target={hasUnsubscribeLink ? "_blank" : undefined}
          onClick={onUnsubscribe}
          rel="noopener noreferrer"
        >
          {buttonContent}
        </Link>
      </Button>
    );

  return (
    <>
      {isBlock && hasUnsubscribeAccess ? (
        <Tooltip content="无退订链接：后续邮件将自动归档">{button}</Tooltip>
      ) : (
        button
      )}

      <ResubscribeDialog
        open={resubscribeDialogOpen}
        onOpenChange={setResubscribeDialogOpen}
        senderName={senderName}
        senderEmail={item.name}
        emailAccountId={emailAccountId}
        mutate={mutate}
      />
    </>
  );
}

function ApproveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,

  emailAccountId,
  filter,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;

  emailAccountId: string;
  filter: NewsletterFilterType;
}) {
  const { onApprove } = useApproveButton({
    item,
    mutate,

    emailAccountId,
    filter,
  });

  return (
    <Tooltip content="继续接收这些邮件">
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={onApprove}
        disabled={!hasUnsubscribeAccess}
      >
        <ThumbsUpIcon className="mr-1.5 size-4" />
        保留
      </Button>
    </Tooltip>
  );
}

function MoveToReviewButton<T extends Row>({
  item,
  mutate,
  emailAccountId,
}: {
  item: T;
  mutate: () => Promise<void>;
  emailAccountId: string;
}) {
  const [loading, setLoading] = useState(false);

  const onMoveToReview = async () => {
    setLoading(true);
    try {
      const result = await setSenderStatusAction(emailAccountId, {
        senderEmail: item.name,
        status: null,
      });
      assertActionSucceeded(result);
      toastSuccess({ description: `已将 ${item.name} 移至待审核` });
      await mutate();
    } catch (error) {
      captureException(error);
      toastError({ description: "更新发件人状态失败" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      onClick={onMoveToReview}
      disabled={loading}
    >
      {loading && <ButtonLoader />}
      移至待审核
    </Button>
  );
}

export function MoreDropdown<T extends Row>({
  onOpenNewsletter,
  item,
  userEmail,
  emailAccountId,
  labels,

  mutate,
  hasUnsubscribeAccess,
  refetchPremium,
  filter,
  openPremiumModal,
}: {
  onOpenNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  emailAccountId: string;
  labels: EmailLabel[];

  mutate: () => Promise<unknown>;
  hasUnsubscribeAccess?: boolean;
  refetchPremium?: () => Promise<UserResponse | null | undefined>;
  filter?: NewsletterFilterType;
  openPremiumModal?: () => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);
  const isMobile = useIsMobile();
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);
  const { onBulkArchive, isBulkArchiving } = useBulkArchive({
    emailAccountId,
    mutate,
  });
  const { onBulkDelete, isBulkDeleting } = useBulkDelete({
    mutate,

    emailAccountId,
  });
  const { onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess: hasUnsubscribeAccess ?? false,
    mutate,
    refetchPremium: refetchPremium ?? noopRefetchPremium,
    emailAccountId,
    filter: filter ?? "all",
  });
  const showAutoArchive = typeof hasUnsubscribeAccess === "boolean";

  const handleLabelClick = async (label: EmailLabel) => {
    const activeFilter = getActiveLabelFilter(item, label);

    if (activeFilter) {
      const res = await deleteFilterAction(emailAccountId, {
        id: activeFilter.id,
      });
      if (res?.serverError) {
        toastError({
          title: "错误",
          description: `取消为 ${item.name} 添加 ${label.name} 标签失败。${res.serverError || ""}`,
        });
      } else {
        toastSuccess({
          title: "成功！",
          description: `已停止为 ${item.name} 添加 ${label.name} 标签`,
        });
        await mutate();
      }
      return;
    }

    const res = await createFilterAction(emailAccountId, {
      from: item.name,
      gmailLabelId: label.id,
    });
    if (res?.serverError) {
      toastError({
        title: "错误",
        description: `将 ${item.name} 添加到 ${label.name} 失败。${res.serverError || ""}`,
      });
    } else {
      toastSuccess({
        title: "成功！",
        description: `已将 ${item.name} 添加到 ${label.name}`,
      });
      await mutate();
    }
  };

  const labelMenuLabel = `${terminology.label.action} future emails`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-haspopup="true" size="icon" variant="ghost">
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">展开或收起菜单</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* View section */}
          {!!onOpenNewsletter && (
            <DropdownMenuItem onClick={() => onOpenNewsletter(item)}>
              <EyeIcon className="mr-2 size-4" />
              <span>预览邮件</span>
            </DropdownMenuItem>
          )}
          {isGoogleProvider(provider) && (
            <DropdownMenuItem asChild>
              <Link
                href={getGmailSearchUrl(item.name, userEmail)}
                target="_blank"
              >
                <ExternalLinkIcon className="mr-2 size-4" />
                <span>在 Gmail 中查看</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isGoogleProvider(provider) && item.autoArchived && (
            <DropdownMenuItem asChild>
              <Link href={getGmailFilterSettingsUrl(userEmail)} target="_blank">
                <ExternalLinkIcon className="mr-2 size-4" />
                <span>查看自动归档筛选器</span>
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Organization section */}
          {isMobile ? (
            <DropdownMenuItem onSelect={() => setLabelSheetOpen(true)}>
              <TagIcon className="mr-2 size-4" />
              <span>{labelMenuLabel}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon className="mr-2 size-4" />
                <span>{labelMenuLabel}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <LabelsSubMenu
                  labels={labels}
                  onClick={handleLabelClick}
                  isLabelActive={(label) =>
                    Boolean(getActiveLabelFilter(item, label))
                  }
                />
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />

          {/* Bulk actions section */}
          {showAutoArchive && (
            <DropdownMenuItem
              onClick={() => {
                if (!hasUnsubscribeAccess) {
                  openPremiumModal?.();
                  return;
                }

                onBulkAutoArchive([item]);
              }}
            >
              <ArchiveRestoreIcon className="mr-2 size-4" />
              <span>自动归档后续邮件</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onBulkArchive([item])}>
            {isBulkArchiving ? (
              <ButtonLoader />
            ) : (
              <ArchiveIcon className="mr-2 size-4" />
            )}
            <span>归档现有邮件</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              const yes = confirm(`确定删除来自 ${item.name} 的全部邮件吗？`);
              if (!yes) return;

              onBulkDelete([item]);
            }}
          >
            {isBulkDeleting ? (
              <ButtonLoader />
            ) : (
              <TrashIcon className="mr-2 size-4" />
            )}
            <span>删除全部邮件</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={labelSheetOpen} onOpenChange={setLabelSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>{labelMenuLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 max-h-[60vh] space-y-1 overflow-y-auto">
            {labels.length ? (
              labels.map((label) => {
                const active = Boolean(getActiveLabelFilter(item, label));

                return (
                  <button
                    key={label.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={async () => {
                      setLabelSheetOpen(false);
                      await handleLabelClick(label);
                    }}
                  >
                    <span className="truncate">{label.name}</span>
                    {active && <CheckIcon className="size-4 text-primary" />}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                暂无 {terminology.label.plural} yet.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function HeaderButton(props: {
  children: React.ReactNode;
  sorted: boolean;
  sortDirection?: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={props.onClick}
    >
      <span
        className={props.sorted ? "text-foreground" : "text-muted-foreground"}
      >
        {props.children}
      </span>
      {props.sorted && props.sortDirection === "asc" ? (
        <ChevronUpIcon className="ml-2 size-4 text-foreground" />
      ) : (
        <ChevronDownIcon
          className={cn(
            "ml-2 size-4",
            props.sorted ? "text-foreground" : "text-muted-foreground/50",
          )}
        />
      )}
    </Button>
  );
}

const senderStatusBadges: Record<
  NewsletterStatus,
  { label: string; variant: "success" | "info" | "muted" }
> = {
  [NewsletterStatus.UNSUBSCRIBED]: {
    label: "已退订",
    variant: "success",
  },
  [NewsletterStatus.AUTO_ARCHIVED]: { label: "已自动归档", variant: "info" },
  [NewsletterStatus.APPROVED]: { label: "已保留", variant: "muted" },
};

async function noopRefetchPremium() {
  return null;
}

function getActiveLabelFilter<T extends Row>(item: T, label: EmailLabel) {
  const labelId = normalizeLabelValue(label.id);
  const labelName = normalizeLabelValue(label.name);

  return item.labelFilters?.find((filter) => {
    if (!filter.id) return false;

    const filterLabelId = normalizeLabelValue(filter.labelId);
    return filterLabelId === labelId || filterLabelId === labelName;
  });
}

function normalizeLabelValue(value: string) {
  return value.trim().toLowerCase();
}
