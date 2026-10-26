"use client";

import { EmailAiFeedback, useEmailAiFeedbackState } from "./EmailAiFeedback";
import { useState, useEffect, useRef, useId } from "react";
import { EmailAiResources, useEmailAiResourceState } from "./EmailAiResources";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { prepareReplyingToEmail } from "@/utils/email/replying-to-email";
import type { ThreadMessage } from "@/components/email-list/types";
import { getActionErrorMessage } from "@/utils/error";
import {
  analyzeEmailAction,
  generateWorkspaceReplyAction,
  getEmailWorkspaceResultsAction,
} from "@/utils/actions/email-workspace";
import {
  isSafeContextHref,
  type ContextSource,
  type EmailWorkspaceResult,
} from "@/utils/ai/email-workspace/types";

type Props = {
  threadId: string;
  message: ThreadMessage;
  variant: "inline" | "sheet";
  onClose: () => void;
  onArchive: () => void;
  onMarkRead: () => void;
  onLabel?: () => void;
};

export function EmailAiPanel({
  threadId,
  message,
  variant,
  onClose,
  onArchive,
  onMarkRead,
  onLabel,
}: Props) {
  const instructionsId = useId();
  const { emailAccountId } = useAccount();
  const resourceState = useEmailAiResourceState({ threadId, message });
  const { popOutReply } = useComposeModal();
  const [tab, setTab] = useState("analysis");
  const [instructions, setInstructions] = useState("");
  const instructionsEdited = useRef(false);
  const instructionsRestored = useRef(false);
  const [pending, setPending] = useState<"analysis" | "reply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"analysis" | "reply">(
    "analysis",
  );
  const {
    data: results = [],
    mutate,
    isLoading,
    error: loadError,
  } = useSWR(
    ["email-workspace", emailAccountId, threadId],
    async () => {
      const response = await getEmailWorkspaceResultsAction(emailAccountId, {
        threadId,
      });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ?? "无法读取处理记录。",
        );
      return response.data;
    },
    { revalidateOnFocus: true },
  );
  const analysis = results.find((result) => result.kind === "analysis");
  const reply = results.find((result) => result.kind === "reply");
  const feedbackState = useEmailAiFeedbackState({ threadId });
  useEffect(() => {
    if (reply && !instructionsEdited.current && !instructionsRestored.current) {
      setInstructions(reply.replyInstructions ?? "");
      instructionsRestored.current = true;
    }
  }, [reply]);
  const sourceResult =
    results.find((result) => result.kind === sourceKind) ?? reply ?? analysis;

  async function run(kind: "analysis" | "reply") {
    if (pending) return;
    setPending(kind);
    setError(null);
    setTab(kind);
    try {
      const response =
        kind === "analysis"
          ? await analyzeEmailAction(emailAccountId, { threadId })
          : await generateWorkspaceReplyAction(emailAccountId, {
              threadId,
              instructions: instructions.trim(),
            });
      if (!response?.data)
        throw new Error(
          getActionErrorMessage(response ?? {}) ?? "暂时无法完成，请重试。",
        );
      const result = response.data;
      await mutate(
        (current) => [
          result,
          ...(current ?? []).filter((item) => item.kind !== kind),
        ],
        false,
      );
      setSourceKind(kind);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "暂时无法完成，请重试。",
      );
    } finally {
      setPending(null);
    }
  }

  function editReply() {
    if (!reply?.draft || reply.messageId !== message.id) return;
    const identity = `ai-reply:${reply.aiRunId}`;
    if (variant === "sheet") onClose();
    popOutReply({
      emailAccountId,
      draftSessionId: identity,
      draftKeyMessageId: message.id,
      draftMode: "reply",
      useLegacyDraft: false,
      suggestedAttachments: reply.draft.attachments,
      replyingToEmail: {
        ...prepareReplyingToEmail(message),
        draftHtml: reply.draft.html,
      },
    });
  }

  const viewSources = (kind: "analysis" | "reply") => {
    setSourceKind(kind);
    setTab("sources");
  };
  const stale = (result?: EmailWorkspaceResult) =>
    Boolean(result && result.messageId !== message.id);
  const requirementsChanged = Boolean(
    reply && (reply.replyInstructions ?? "") !== instructions.trim(),
  );
  const body = (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      data-testid="email-ai-panel"
    >
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-col"
      >
        <TabsList className="mx-4 mt-4 grid grid-cols-4">
          <TabsTrigger value="analysis">分析</TabsTrigger>
          <TabsTrigger value="reply">回复</TabsTrigger>
          <TabsTrigger value="sources">资料</TabsTrigger>
          <TabsTrigger value="actions">操作</TabsTrigger>
        </TabsList>
        {(error || loadError) && (
          <Notice>{error ?? "暂时无法读取历史结果，可以重新分析。"}</Notice>
        )}
        {pending && (
          <p
            className="flex items-center gap-2 px-5 pt-4 text-muted-foreground text-sm"
            role="status"
          >
            <Loader2Icon className="size-4 animate-spin" />
            {pending === "analysis"
              ? "正在分析邮件…"
              : "正在检索资料并生成回复…"}
          </p>
        )}
        <TabsContent value="analysis" className="space-y-5 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm">邮件分析</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => run("analysis")}
            >
              {analysis ? "重新分析" : "分析邮件"}
            </Button>
          </div>
          {stale(analysis) && (
            <Notice>会话已有更新，请重新分析后再使用建议。</Notice>
          )}
          {analysis?.analysis ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {analysis.analysis.summary}
              </p>
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-1 font-medium">
                  {analysis.analysis.needsReply ? "需要回复" : "暂不需要回复"}
                </p>
                <p className="text-muted-foreground">
                  {analysis.analysis.replyReason}
                </p>
              </div>
              {analysis.analysis.requests.length > 0 && (
                <Section title="对方的问题和要求">
                  <ItemList values={analysis.analysis.requests} />
                </Section>
              )}
              {analysis.matchedRules.length > 0 && (
                <Section title="相关规则">
                  {analysis.matchedRules.map((rule) => (
                    <div className="rounded-md border p-3" key={rule.id}>
                      <p className="text-sm font-medium">{rule.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rule.reason}
                      </p>
                    </div>
                  ))}
                </Section>
              )}
              <ResultNotices result={analysis} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => viewSources("analysis")}
              >
                查看分析依据 <ArrowUpRightIcon className="ml-1 size-3.5" />
              </Button>
            </>
          ) : (
            <EmptyState
              title={
                isLoading ? "正在读取处理记录…" : "围绕当前邮件查看处理建议"
              }
              text="分析会概括会话、识别回复需求并匹配现有规则。"
            />
          )}
        </TabsContent>
        <TabsContent value="reply" className="space-y-4 px-5 py-4">
          <label htmlFor={instructionsId} className="block space-y-2 text-sm">
            <span className="font-medium">本次回复要求</span>
            <Textarea
              id={instructionsId}
              value={instructions}
              onChange={(event) => {
                instructionsEdited.current = true;
                setInstructions(event.target.value);
              }}
              placeholder="例如：简短回复，先确认交付日期"
              maxLength={2000}
              rows={3}
            />
          </label>
          <Button
            size="sm"
            disabled={Boolean(pending)}
            onClick={() => run("reply")}
          >
            <SparklesIcon className="mr-2 size-3.5" />
            {reply ? "重新生成回复" : "生成回复草稿"}
          </Button>
          {stale(reply) && <Notice>会话已有更新，请重新生成回复。</Notice>}
          {requirementsChanged && (
            <Notice>回复要求已修改，请重新生成后再使用草稿。</Notice>
          )}
          {reply?.draft ? (
            <>
              <div className="rounded-lg border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">回复草稿</span>
                  <Badge variant="outline">
                    {reply.missingInformation.length
                      ? "待确认"
                      : "请核对后发送"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {reply.draft.text}
                </p>
              </div>
              {!!reply.draft.attachments?.length && (
                <Section title="建议随回复附加的文件">
                  {reply.draft.attachments.map((file) => (
                    <p
                      className="text-sm"
                      key={file.driveConnectionId + file.fileId}
                    >
                      {file.filename}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {file.reason} · 在写信窗口确认后添加
                      </span>
                    </p>
                  ))}
                </Section>
              )}
              <ResultNotices result={reply} />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={
                    stale(reply) || requirementsChanged || Boolean(pending)
                  }
                  onClick={editReply}
                >
                  在写信窗口编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => viewSources("reply")}
                >
                  查看参考资料
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="参考已有资料生成回复"
              text="使用知识库、历史邮件、回复经验，以及适用的日历、会议和附件内容。"
            />
          )}
        </TabsContent>
        <TabsContent value="sources" className="space-y-4 px-5 py-4">
          <h3 className="font-medium text-sm">
            {sourceResult?.kind === "reply"
              ? "本次回复的参考资料"
              : "本次分析的依据"}
          </h3>
          {sourceResult?.sources.length ? (
            sourceResult.sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))
          ) : (
            <EmptyState
              title="暂无参考资料"
              text="完成分析或生成回复后，这里会显示实际提供给模型的资料片段。"
            />
          )}
          {sourceResult && <ResultNotices result={sourceResult} />}
        </TabsContent>
        <TabsContent value="actions" className="space-y-4 px-5 py-4">
          <h3 className="font-medium text-sm">建议操作</h3>
          {!analysis && (
            <EmptyState
              title="先分析这封邮件"
              text="确认邮件内容后，再选择要执行的操作。"
            />
          )}
          {(analysis?.analysis?.suggestedActions ?? []).map((action, index) => (
            <div
              className="rounded-lg border p-3"
              key={`${action.type}:${index}`}
            >
              <p className="text-sm leading-6">{action.reason}</p>
              <div className="mt-2">
                {action.type === "archive" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stale(analysis)}
                    onClick={onArchive}
                  >
                    归档邮件
                  </Button>
                ) : action.type === "mark_read" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stale(analysis)}
                    onClick={onMarkRead}
                  >
                    标记为已读
                  </Button>
                ) : action.type === "reply" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stale(analysis) || Boolean(pending)}
                    onClick={() => run("reply")}
                  >
                    准备回复
                  </Button>
                ) : action.type === "label" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stale(analysis) || !onLabel}
                    onClick={onLabel}
                  >
                    选择标签
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      document
                        .getElementById(`workspace-${action.type}`)
                        ?.scrollIntoView({ block: "start", behavior: "smooth" })
                    }
                  >
                    {
                      {
                        calendar: "准备日程方案",
                        meeting: "查看会议资料",
                        attachment: "读取与整理附件",
                      }[action.type]
                    }
                  </Button>
                )}
              </div>
            </div>
          ))}
          <EmailAiFeedback
            state={feedbackState}
            instructions={instructions}
            ruleIds={analysis?.matchedRules ?? []}
          />
          <EmailAiResources
            state={resourceState}
            threadId={threadId}
            message={message}
          />
          <Section title="关联功能">
            <div className="flex flex-wrap gap-2">
              {(["calendar", "meeting", "attachment"] as const).map((type) => (
                <ResourceLink
                  accountId={emailAccountId}
                  type={type}
                  key={type}
                />
              ))}
            </div>
          </Section>
          {(reply?.relatedResources ?? []).length > 0 && (
            <Section title="参考记录">
              {reply?.relatedResources.map((resource) => (
                <Link
                  className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                  href={resource.href}
                  key={`${resource.type}:${resource.id}`}
                >
                  <FileTextIcon className="size-4 shrink-0" />
                  {resource.title}
                  <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0" />
                </Link>
              ))}
            </Section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
  if (variant === "sheet")
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetTitle className="flex items-center gap-2 border-b px-5 py-4 text-base">
            <SparklesIcon className="size-4 text-primary" />
            AI 助手
          </SheetTitle>
          <SheetDescription className="sr-only">
            当前邮件的分析、回复和参考资料
          </SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    );
  return (
    <aside
      className="flex w-[380px] shrink-0 flex-col border-l bg-card outline-none"
      aria-label="邮件 AI 助手"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          <SparklesIcon className="size-4 text-primary" />
          AI 助手
        </h2>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="关闭 AI 助手"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      {body}
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </section>
  );
}
function ItemList({ values }: { values: string[] }) {
  return (
    <ul className="space-y-2 pl-4 text-sm leading-6 list-disc">
      {values.map((value, index) => (
        <li key={`${index}:${value}`}>{value}</li>
      ))}
    </ul>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mx-4 mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 text-xs leading-5 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-xs text-muted-foreground leading-5">{text}</p>
    </div>
  );
}
function ResultNotices({ result }: { result: EmailWorkspaceResult }) {
  return (
    <>
      {result.missingInformation.length > 0 && (
        <Section title="待确认的信息">
          <ItemList values={result.missingInformation} />
        </Section>
      )}
      {result.issues.map((issue, index) => (
        <Notice key={`${issue.source}:${index}`}>{issue.message}</Notice>
      ))}
    </>
  );
}
const sourceLabels: Record<ContextSource["type"], string> = {
  email: "邮件",
  knowledge: "知识库",
  reply_memory: "回复经验",
  calendar: "日历",
  meeting: "会议",
  attachment: "附件",
  writing_style: "写作偏好",
};
function SourceCard({ source }: { source: ContextSource }) {
  return (
    <details className="group rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">
        <Badge variant="outline" className="mr-2 text-xs">
          {sourceLabels[source.type]}
        </Badge>
        {source.title}
      </summary>
      <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
        {source.excerpt}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        资料时间：
        {Number.isFinite(Date.parse(source.observedAt))
          ? new Date(source.observedAt).toLocaleString("zh-CN")
          : "未记录"}
      </p>
      {isSafeContextHref(source.href) && (
        <Link
          className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          href={source.href}
          target={source.href.startsWith("https:") ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          打开来源 <ArrowUpRightIcon className="size-3" />
        </Link>
      )}
    </details>
  );
}
function ResourceLink({
  accountId,
  type,
}: {
  accountId: string;
  type: "calendar" | "meeting" | "attachment";
}) {
  const paths = {
    calendar: ["calendars", "日历和预约"],
    meeting: ["meetings", "会议记录"],
    attachment: ["drive", "附件整理"],
  };
  const [path, label] = paths[type];
  return (
    <Button size="sm" variant="outline" asChild>
      <Link href={`/${accountId}/${path}`}>
        {label}
        <ArrowUpRightIcon className="ml-1 size-3.5" />
      </Link>
    </Button>
  );
}
