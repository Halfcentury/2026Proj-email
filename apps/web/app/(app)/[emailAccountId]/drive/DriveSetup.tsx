"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ExternalLinkIcon, FolderIcon, PlusIcon } from "lucide-react";
import {
  TypographyH3,
  SectionDescription,
  TypographyP,
  TypographyH4,
  MutedText,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { FilingStatusCell } from "@/components/drive/FilingStatusCell";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import { TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useFilingPreviewAttachments } from "@/hooks/useFilingPreviewAttachments";
import {
  updateFilingPromptAction,
  updateFilingEnabledAction,
  moveFilingAction,
  fileAttachmentAction,
  submitPreviewFeedbackAction,
  type FileAttachmentFiled,
} from "@/utils/actions/drive";
import {
  updateFilingPromptBody,
  type UpdateFilingPromptBody,
} from "@/utils/actions/drive.validation";
import {
  CreateFolderDialog,
  FolderNode,
  NoFoldersFound,
} from "./AllowedFolders";
import { useFolderSelection } from "./use-folder-selection";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { DriveConnectionCard, getProviderInfo } from "./DriveConnectionCard";
import type { AttachmentPreviewItem } from "@/app/api/user/drive/preview/attachments/route";
import { LoadingContent } from "@/components/LoadingContent";
import { getEmailUrlForMessage } from "@/utils/url";
import { AlertBasic } from "@/components/Alert";

type SetupPhase = "setup" | "loading-attachments" | "preview" | "starting";

type FilingState = {
  status: "pending" | "filing" | "filed" | "skipped" | "error";
  result?: FileAttachmentFiled;
  error?: string;
  skipReason?: string;
  filingId?: string; // Available for both filed and skipped items (for feedback)
};

export function DriveSetup() {
  const { emailAccountId } = useAccount();

  const { data: connectionsData } = useDriveConnections();
  const {
    data: foldersData,
    isLoading: foldersLoading,
    mutate: mutateFolders,
  } = useDriveFolders(emailAccountId);
  const { data: emailAccount, mutate: mutateEmail } = useEmailAccountFull();

  const connections = connectionsData?.connections || [];
  const connection = connections[0];
  const providerInfo = connection ? getProviderInfo(connection.provider) : null;

  const [userPhase, setUserPhase] = useState<
    "setup" | "previewing" | "starting"
  >("setup");
  const [filingStates, setFilingStates] = useState<Record<string, FilingState>>(
    {},
  );

  const shouldFetchAttachments =
    userPhase === "previewing" || userPhase === "starting";
  const { data: attachmentsData, isLoading: attachmentsLoading } =
    useFilingPreviewAttachments(shouldFetchAttachments, {
      onSuccess: (data) => {
        // Initialize states and trigger filing for each attachment
        const initial: Record<string, FilingState> = {};
        for (const att of data.attachments) {
          const key = `${att.messageId}-${att.filename}`;
          initial[key] = { status: "filing" };

          fileAttachmentAction(emailAccountId, {
            messageId: att.messageId,
            filename: att.filename,
          })
            .then((result) => {
              const resultData = result?.data;
              if (result?.serverError) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: result.serverError },
                }));
              } else if (resultData?.skipped) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: {
                    status: "skipped",
                    skipReason: resultData.skipReason,
                    filingId: resultData.filingId,
                  },
                }));
              } else if (resultData) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "filed", result: resultData },
                }));
              } else {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: "未知错误" },
                }));
              }
            })
            .catch((err) => {
              setFilingStates((prev) => ({
                ...prev,
                [key]: {
                  status: "error",
                  error: err instanceof Error ? err.message : "Filing failed",
                },
              }));
            });
        }
        setFilingStates(initial);
      },
      onError: (err) => {
        toastError({
          title: "获取预览失败",
          description:
            err instanceof Error
              ? err.message
              : "Failed to load recent attachments. Please try again.",
        });
        setUserPhase("setup");
      },
    });

  const displayPhase = useMemo((): SetupPhase => {
    if (userPhase === "setup") return "setup";
    if (userPhase === "starting") return "starting";
    if (attachmentsLoading) return "loading-attachments";
    if (attachmentsData) return "preview";
    return "loading-attachments";
  }, [userPhase, attachmentsLoading, attachmentsData]);

  const handlePreviewClick = useCallback(() => {
    setUserPhase("previewing");
  }, [connection, foldersData?.savedFolders.length]);

  const handleStartFiling = useCallback(async () => {
    setUserPhase("starting");
    try {
      const result = await updateFilingEnabledAction(emailAccountId, {
        filingEnabled: true,
      });

      if (result?.serverError) {
        toastError({
          title: "启动自动整理失败",
          description: result.serverError,
        });
        setUserPhase("previewing");
        return;
      }

      toastSuccess({ description: "自动整理已启动！" });
      await mutateEmail();
    } catch (error) {
      toastError({
        title: "启动自动整理失败",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while starting auto-filing.",
      });
      setUserPhase("previewing");
    }
  }, [emailAccountId, mutateEmail]);

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center">
        <TypographyH3>配置自动整理</TypographyH3>
        <SectionDescription className="mx-auto mt-3 max-w-xl">
          将把邮件附件整理到你的 {providerInfo?.name || "drive"}.<br />
          请说明存放位置和整理方式。
        </SectionDescription>
      </div>

      <div className="mt-6 flex justify-center">
        {connection ? (
          <DriveConnectionCard connection={connection} />
        ) : (
          <TypographyP>尚未连接云存储，请连接后继续配置。</TypographyP>
        )}
      </div>

      <div className="mt-10 space-y-8">
        <SetupFolderSelection
          emailAccountId={emailAccountId}
          availableFolders={foldersData?.availableFolders || []}
          savedFolders={foldersData?.savedFolders || []}
          staleFolderCount={foldersData?.staleFolderDbIds.length || 0}
          connections={connections}
          mutateFolders={mutateFolders}
          isLoading={foldersLoading}
        />

        <SetupRulesForm
          emailAccountId={emailAccountId}
          initialPrompt={emailAccount?.filingPrompt || ""}
          mutateEmail={mutateEmail}
          hasFolders={foldersData ? foldersData.savedFolders.length > 0 : false}
          phase={displayPhase}
          onPreviewClick={handlePreviewClick}
        />

        {(displayPhase === "preview" || displayPhase === "starting") &&
          attachmentsData && (
            <PreviewContent
              emailAccountId={emailAccountId}
              attachments={attachmentsData.attachments}
              noAttachmentsFound={attachmentsData.noAttachmentsFound}
              savedFolders={foldersData?.savedFolders || []}
              filingStates={filingStates}
              onStartFiling={handleStartFiling}
              isStarting={displayPhase === "starting"}
            />
          )}
      </div>
    </div>
  );
}

function PreviewContent({
  emailAccountId,
  attachments,
  noAttachmentsFound,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  noAttachmentsFound: boolean;
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  if (noAttachmentsFound) {
    return (
      <NoAttachmentsMessage onSkip={onStartFiling} isStarting={isStarting} />
    );
  }

  return (
    <PreviewResults
      emailAccountId={emailAccountId}
      attachments={attachments}
      savedFolders={savedFolders}
      filingStates={filingStates}
      onStartFiling={onStartFiling}
      isStarting={isStarting}
    />
  );
}

function NoAttachmentsMessage({
  onSkip,
  isStarting,
}: {
  onSkip: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="text-center">
      <MutedText className="mb-4">未找到可预览的近期附件邮件。</MutedText>
      <Button onClick={onSkip} loading={isStarting}>
        直接启动自动整理
      </Button>
    </div>
  );
}

function PreviewResults({
  emailAccountId,
  attachments,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const { userEmail, provider } = useAccount();

  const allComplete = attachments.every((att) => {
    const key = `${att.messageId}-${att.filename}`;
    const status = filingStates[key]?.status;
    return status === "filed" || status === "skipped" || status === "error";
  });

  const anyFiling = attachments.some((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filing" || !filingStates[key];
  });

  const filedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filed";
  }).length;

  const skippedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "skipped";
  }).length;

  const statusMessage = allComplete
    ? filedCount > 0
      ? `Filed ${filedCount} attachment${filedCount !== 1 ? "s" : ""}${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}:`
      : `Skipped ${skippedCount} attachment${skippedCount !== 1 ? "s" : ""} (didn't match your filing preferences):`
    : `Filing your ${attachments.length} most recent attachments...`;

  return (
    <div>
      <TypographyH4>3. 查看整理效果</TypographyH4>
      <MutedText className="mt-1">{statusMessage}</MutedText>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件</TableHead>
              <TableHead>文件夹</TableHead>
              <TableHead className="w-[100px] text-right">是否正确？</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attachments.map((attachment) => {
              const key = `${attachment.messageId}-${attachment.filename}`;
              return (
                <FilingRow
                  key={key}
                  emailAccountId={emailAccountId}
                  attachment={attachment}
                  filingState={filingStates[key] || { status: "filing" }}
                  savedFolders={savedFolders}
                  userEmail={userEmail}
                  provider={provider}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        你的反馈有助于改进整理结果
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          onClick={onStartFiling}
          loading={isStarting}
          disabled={anyFiling}
        >
          {anyFiling ? "正在处理…" : "结果正确，启动自动整理"}
        </Button>
        <p className="text-xs text-muted-foreground">
          每次整理后都会发送邮件，你可以回复修正结果。
        </p>
      </div>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  attachment,
  filingState,
  savedFolders,
  userEmail,
  provider,
}: {
  emailAccountId: string;
  attachment: AttachmentPreviewItem;
  filingState: FilingState;
  savedFolders: SavedFolder[];
  userEmail: string;
  provider: string;
}) {
  const [correctedPath, setCorrectedPath] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const voteBeforeDropdownRef = useRef<boolean | null>(null);

  const folderPath = correctedPath ?? filingState.result?.folderPath ?? null;

  const handleMoveToFolder = useCallback(
    async (folder: SavedFolder) => {
      const filingId = filingState.result?.filingId;
      if (!filingId) return;

      setIsMoving(true);

      try {
        await moveFilingAction(emailAccountId, {
          filingId,
          targetFolderId: folder.folderId,
          targetFolderPath: folder.folderPath,
        });

        setCorrectedPath(folder.folderPath);
        toastSuccess({ description: `已移至 ${folder.folderName}` });
      } catch {
        setVote(voteBeforeDropdownRef.current);
        toastError({ description: "移动文件失败" });
      } finally {
        setIsMoving(false);
      }
    },
    [emailAccountId, filingState.result?.filingId],
  );

  const handleCorrectClick = useCallback(async () => {
    const filingId = filingState.result?.filingId || filingState.filingId;
    if (!filingId) return;

    setVote(true);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: true,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "提交反馈失败" });
    } else {
    }
  }, [
    emailAccountId,
    filingState.filingId,
    filingState.result?.filingId,
    filingState.status,
  ]);

  const handleWrongClick = useCallback(async () => {
    const filingId = filingState.result?.filingId;
    if (!filingId) return;

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "提交反馈失败" });
    } else {
    }
  }, [emailAccountId, filingState.result?.filingId, filingState.status]);

  const handleSkippedWrongClick = useCallback(async () => {
    const filingId = filingState.filingId;
    if (!filingId) return;

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "提交反馈失败" });
    } else {
    }
  }, [emailAccountId, filingState.filingId, filingState.status]);

  const isFiled = filingState.status === "filed";
  const isSkipped = filingState.status === "skipped";

  const otherFolders = savedFolders.filter((f) => f.folderPath !== folderPath);

  const emailUrl = getEmailUrlForMessage(
    attachment.messageId,
    attachment.threadId,
    userEmail,
    provider,
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate max-w-[200px]">
            {attachment.filename}
          </span>
          <Link
            href={emailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            title="打开邮件"
          >
            <ExternalLinkIcon className="size-3.5" />
          </Link>
        </div>
      </TableCell>
      <TableCell className="break-words max-w-[200px]">
        <FilingStatusCell
          status={filingState.status}
          skipReason={filingState.skipReason}
          error={filingState.error}
          folderPath={folderPath}
        />
      </TableCell>
      <TableCell>
        {isFiled && otherFolders.length > 0 ? (
          <div className="flex items-center justify-end">
            <DropdownMenu
              onOpenChange={(open) => {
                setDropdownOpen(open);
                if (open) {
                  voteBeforeDropdownRef.current = vote;
                  setVote(false);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <div>
                  <YesNoIndicator
                    value={vote}
                    onClick={(value) => {
                      if (value) handleCorrectClick();
                    }}
                    dropdownTrigger="wrong"
                    wrongActive={dropdownOpen}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>此文件应放入哪个文件夹？</DropdownMenuLabel>
                {otherFolders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.folderId}
                    disabled={isMoving}
                    onClick={() => handleMoveToFolder(folder)}
                  >
                    <FolderIcon className="size-4" />
                    {folder.folderName}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => setVote(voteBeforeDropdownRef.current)}
                >
                  取消
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : isFiled ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              value={vote}
              onClick={(value) => {
                if (value) handleCorrectClick();
                else handleWrongClick();
              }}
            />
          </div>
        ) : isSkipped && filingState.filingId ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              value={vote}
              onClick={(value) => {
                if (value) {
                  handleCorrectClick();
                } else {
                  handleSkippedWrongClick();
                }
              }}
            />
          </div>
        ) : (
          <div className="h-8" />
        )}
      </TableCell>
    </TableRow>
  );
}

function SetupFolderSelection({
  emailAccountId,
  availableFolders,
  savedFolders,
  staleFolderCount,
  connections,
  mutateFolders,
  isLoading,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  staleFolderCount: number;
  connections: Array<{ id: string; provider: string }>;
  mutateFolders: () => void;
  isLoading: boolean;
}) {
  // TODO: This assumes a single drive connection; swap to a selected connection ID when multi-connection UX exists.
  const driveConnectionId = connections[0]?.id ?? null;

  const onFoldersAdded = useCallback((savedFolderCount: number) => {}, []);
  const onFoldersRemoved = useCallback((savedFolderCount: number) => {}, []);

  const {
    optimisticFolderIds,
    childrenByParentId,
    rootFolders,
    handleFolderToggle,
    handleChildrenLoaded,
  } = useFolderSelection({
    emailAccountId,
    availableFolders,
    savedFolders,
    mutateFolders,
    onFoldersAdded,
    onFoldersRemoved,
  });

  return (
    <div>
      <TypographyH4>1. 选择文件夹</TypographyH4>
      <MutedText className="mt-1">
        允许整理到哪些文件夹？{" "}
        <span className="text-muted-foreground">
          （仅会将文件放入你选择的文件夹）
        </span>
      </MutedText>
      {staleFolderCount > 0 && (
        <AlertBasic
          className="mt-4"
          variant="blue"
          title="检测到已删除的文件夹"
          description={`已从保存列表移除 ${staleFolderCount} 个已删除文件夹。`}
        />
      )}

      <LoadingContent loading={isLoading} error={undefined}>
        {rootFolders.length > 0 ? (
          <>
            <div className="mt-4">
              <TreeProvider
                showLines
                showIcons
                selectable={false}
                animateExpand
                indent={16}
              >
                <TreeView className="p-0">
                  {rootFolders.map((folder, index) => (
                    <FolderNode
                      key={folder.id}
                      folder={folder}
                      isLast={index === rootFolders.length - 1}
                      selectedFolderIds={optimisticFolderIds}
                      onToggle={handleFolderToggle}
                      level={0}
                      parentPath=""
                      childrenByParentId={childrenByParentId}
                      onChildrenLoaded={handleChildrenLoaded}
                      knownChildren={childrenByParentId.get(folder.id)}
                    />
                  ))}
                </TreeView>
              </TreeProvider>
            </div>
            <div className="mt-2">
              <CreateFolderDialog
                emailAccountId={emailAccountId}
                driveConnectionId={driveConnectionId}
                onFolderCreated={mutateFolders}
                triggerLabel="添加文件夹"
                triggerVariant="ghost"
                triggerSize="xs-2"
                triggerIcon={PlusIcon}
                triggerClassName="text-muted-foreground hover:text-foreground"
              />
            </div>
          </>
        ) : (
          <NoFoldersFound
            emailAccountId={emailAccountId}
            driveConnectionId={driveConnectionId}
            onFolderCreated={mutateFolders}
          />
        )}
      </LoadingContent>
    </div>
  );
}

function SetupRulesForm({
  emailAccountId,
  initialPrompt,
  mutateEmail,
  hasFolders,
  phase,
  onPreviewClick,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
  hasFolders: boolean;
  phase: SetupPhase;
  onPreviewClick: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const filingPrompt = watch("filingPrompt");
  const canPreview = (filingPrompt || "").trim().length > 0 && hasFolders;
  const isLoading = phase === "loading-attachments";
  const showPreviewButton =
    phase === "setup" || phase === "loading-attachments";

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      if (!canPreview) {
        toastError({
          title: "配置未完成",
          description: "请至少选择一个文件夹，并说明文件整理方式。",
        });
        return;
      }

      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "保存规则失败",
          description: result.serverError,
        });
      } else {
        mutateEmail();
        // Trigger preview after successful save
        onPreviewClick();
      }
    },
    [canPreview, emailAccountId, initialPrompt, mutateEmail, onPreviewClick],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold">2. 说明整理方式</h3>
      <MutedText className="mt-1">用自然语言说明</MutedText>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <Input
          type="textarea"
          name="filingPrompt"
          placeholder={
            "合同按房产地址放入交易文件夹，收据按月份放入收据文件夹。"
          }
          registerProps={register("filingPrompt")}
          error={errors.filingPrompt}
          autosizeTextarea
          rows={3}
        />
        {errors.filingPrompt && (
          <p className="text-sm text-red-500">{errors.filingPrompt.message}</p>
        )}
        {showPreviewButton && (
          <div className="mt-10 text-center">
            <Button
              type="submit"
              disabled={!canPreview || isLoading}
              loading={isLoading}
            >
              {isLoading ? "正在查找近期附件…" : "使用近期邮件预览"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
