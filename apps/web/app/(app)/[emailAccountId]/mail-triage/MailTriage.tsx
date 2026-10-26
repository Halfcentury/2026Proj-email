"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { StarIcon } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { PageWrapper } from "@/components/PageWrapper";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  analyzeMailTriageAction,
  archiveMailTriageAction,
  resetMailTriageAction,
  starMailTriageAction,
} from "@/utils/actions/mail-triage";
import { getActionErrorMessage } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";
import { randomUuid } from "@/utils/uuid";
import {
  getArchiveBlockReason,
  triageMessagesSchema,
} from "@/utils/mail-triage/schema";
import type { MailTriageResponse } from "@/app/api/user/mail-triage/route";

const CATEGORY_LABELS = {
  action_required: "待处理",
  information: "仅知悉",
  marketing: "营销",
  manual_review: "需人工核查",
};
const CLIENT_ANALYSIS_DEADLINE_MS = 20_000;

/** Display per-message evidence, explicit empty selection, archive confirmation and persistent results. */
export function MailTriage() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading, mutate } = useSWR<MailTriageResponse>(
    ["/api/user/mail-triage", emailAccountId],
    loadMailbox,
  );
  const [selection, setSelection] = useState<{
    version: number | null;
    ids: string[];
  }>({ version: null, ids: [] });
  const selectedIds = selection.version === data?.version ? selection.ids : [];
  const [view, setView] = useState<"inbox" | "all">("inbox");
  const [scenario, setScenario] = useState<
    "normal" | "unavailable" | "timeout"
  >("normal");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  /** Update the displayed mailbox after a mutation and discard any previous selection. */
  function acceptSnapshot(snapshot: MailTriageResponse) {
    mutate(snapshot, false);
    setSelection({ version: null, ids: [] });
    setConfirmationOpen(false);
    setClientError(null);
  }

  const analyzeAction = useAction(
    analyzeMailTriageAction.bind(null, emailAccountId),
  );
  const archiveAction = useAction(
    archiveMailTriageAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data: snapshot }) => {
        if (snapshot) acceptSnapshot(snapshot);
      },
      onError: ({ error: actionError }) =>
        setClientError(getActionErrorMessage(actionError)),
    },
  );
  const resetAction = useAction(
    resetMailTriageAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data: snapshot }) => {
        if (snapshot) acceptSnapshot(snapshot);
      },
      onError: ({ error: actionError }) =>
        setClientError(getActionErrorMessage(actionError)),
    },
  );
  const starAction = useAction(
    starMailTriageAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data: snapshot }) => {
        if (snapshot) acceptSnapshot(snapshot);
      },
      onError: ({ error: actionError }) =>
        setClientError(getActionErrorMessage(actionError)),
    },
  );
  const busy =
    isAnalyzing ||
    archiveAction.isExecuting ||
    resetAction.isExecuting ||
    starAction.isExecuting;
  const state = data?.state;
  const errorMessage = clientError || state?.lastError;
  const inboxCount = state?.messages.filter(({ inbox }) => inbox).length ?? 0;
  const visibleMessages =
    state?.messages.filter((message) => view === "all" || message.inbox) ?? [];

  /** Bound the visible analysis wait and ignore a response received after that deadline. */
  async function generateSuggestions(nextScenario = scenario) {
    setSelection({ version: null, ids: [] });
    setConfirmationOpen(false);
    setClientError(null);
    setIsAnalyzing(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        analyzeAction.executeAsync({ scenario: nextScenario }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "分析失败，邮件未被修改，请重试。请求等待超过 20 秒。",
                ),
              ),
            CLIENT_ANALYSIS_DEADLINE_MS,
          );
        }),
      ]);
      if (result?.data) acceptSnapshot(result.data);
      else
        setClientError(result?.serverError || "分析失败，邮件未被修改，请重试");
    } catch (analysisError) {
      setClientError(
        analysisError instanceof Error
          ? analysisError.message
          : "分析失败，邮件未被修改，请重试",
      );
    } finally {
      clearTimeout(timeout);
      setIsAnalyzing(false);
    }
  }

  /** Validate imported synthetic JSON before replacing the isolated mailbox. */
  async function importMessages(file?: File) {
    if (!file || !data) return;
    try {
      const messages = triageMessagesSchema.parse(
        JSON.parse(await file.text()),
      );
      setSelection({ version: null, ids: [] });
      resetAction.execute({ version: data.version, messages });
    } catch {
      setClientError(
        "导入失败：请使用包含唯一 ID、from、subject、body、starred、inbox 的邮件 JSON 数组。",
      );
    }
  }

  return (
    <PageWrapper className="py-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold">邮件整理</h1>
        <p className="text-sm text-muted-foreground">
          测试邮箱 · {data?.state.messages.length ?? 12} 封邮件 ·
          分析后由你逐封选择并确认归档
        </p>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        {data && state && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy} onClick={() => generateSuggestions()}>
                {isAnalyzing ? "正在生成建议…" : "生成整理建议"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !selectedIds.length}
                onClick={() => setConfirmationOpen(true)}
              >
                确认归档（{selectedIds.length}）
              </Button>
              <span className="text-sm text-muted-foreground">
                生成建议不会修改邮件；星标、待处理和不确定邮件受到保护。
              </span>
            </div>
            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
              >
                <p>{errorMessage}</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setScenario("normal");
                    generateSuggestions("normal");
                  }}
                >
                  重试
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={view === "inbox" ? "default" : "outline"}
                onClick={() => setView("inbox")}
              >
                收件箱（{inboxCount}）
              </Button>
              <Button
                variant={view === "all" ? "default" : "outline"}
                onClick={() => setView("all")}
              >
                全部邮件（{state.messages.length}）
              </Button>
            </div>
            <div className="space-y-3">
              {visibleMessages.map((message) => {
                const suggestion =
                  !errorMessage && !isAnalyzing
                    ? state.suggestions.find(
                        ({ messageId }) => messageId === message.id,
                      )
                    : undefined;
                const blockReason = getArchiveBlockReason(message, suggestion);
                return (
                  <article
                    key={message.id}
                    data-testid={`triage-${message.id}`}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        aria-label={`选择 ${message.id}`}
                        className="mt-1"
                        disabled={busy || Boolean(blockReason)}
                        checked={
                          !blockReason && selectedIds.includes(message.id)
                        }
                        onCheckedChange={(checked) =>
                          setSelection({
                            version: data.version,
                            ids:
                              checked === true
                                ? [...new Set([...selectedIds, message.id])]
                                : selectedIds.filter((id) => id !== message.id),
                          })
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {message.id}
                          </span>
                          <h2 className="font-medium">{message.subject}</h2>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs">
                            {suggestion
                              ? CATEGORY_LABELS[suggestion.category]
                              : "未分析"}
                          </span>
                          {!message.inbox && (
                            <span className="text-xs text-muted-foreground">
                              已归档
                            </span>
                          )}
                        </div>
                        <p className="break-all text-xs text-muted-foreground">
                          {message.from}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {message.body}
                        </p>
                        {suggestion && (
                          <div className="space-y-1 border-l-2 border-primary/30 pl-3 text-sm">
                            {suggestion.evidence.map(
                              ({ field, quote }, index) => (
                                <blockquote
                                  key={`${field}-${index}`}
                                  className="whitespace-pre-wrap break-words"
                                >
                                  原文依据（
                                  {field === "subject" ? "标题" : "正文"}）：“
                                  {quote}”
                                </blockquote>
                              ),
                            )}
                            <p className="text-muted-foreground">
                              {suggestion.explanation}
                            </p>
                          </div>
                        )}
                        <p className="text-xs font-medium">
                          {blockReason || "可归档候选 · 等待你选择并确认"}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${message.starred ? "取消星标" : "星标"} ${message.id}`}
                        aria-pressed={message.starred}
                        disabled={busy}
                        onClick={() =>
                          starAction.execute({
                            version: data.version,
                            messageId: message.id,
                            starred: !message.starred,
                          })
                        }
                      >
                        <StarIcon
                          className={
                            message.starred
                              ? "size-4 fill-amber-400 text-amber-500"
                              : "size-4"
                          }
                        />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <section className="rounded-lg border p-4" aria-label="操作日志">
              <h2 className="mb-3 font-semibold">操作日志</h2>
              {!state.logs.length ? (
                <p className="text-sm text-muted-foreground">暂无归档记录</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {state.logs.map((entry) => (
                    <li
                      key={`${entry.requestId}-${entry.messageId}`}
                      className="flex flex-wrap gap-3"
                    >
                      <span>{entry.messageId}</span>
                      <span>
                        归档{entry.result === "success" ? "成功" : "失败"}
                      </span>
                      <time dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleString("zh-CN")}
                      </time>
                      {entry.reason && <span>{entry.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">验收工具</summary>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSelection({ version: null, ids: [] });
                    resetAction.execute({ version: data.version });
                  }}
                >
                  重置 12 封测试邮件
                </Button>
                <label className="text-sm">
                  分析接口状态{" "}
                  <select
                    aria-label="分析接口状态"
                    className="ml-2 rounded border bg-background px-2 py-1"
                    value={scenario}
                    disabled={busy}
                    onChange={(event) =>
                      setScenario(event.target.value as typeof scenario)
                    }
                  >
                    <option value="normal">正常（真实模型）</option>
                    <option value="unavailable">模拟 HTTP 503</option>
                    <option value="timeout">模拟 15 秒超时</option>
                  </select>
                </label>
                <label className="text-sm">
                  导入邮件 JSON{" "}
                  <input
                    aria-label="导入邮件 JSON"
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={(event) => {
                      importMessages(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    className="ml-2 max-w-56"
                  />
                </label>
              </div>
            </details>
            <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>确认归档所选邮件</DialogTitle>
                  <DialogDescription>
                    将 {selectedIds.join("、")}{" "}
                    移出测试收件箱，原邮件仍保留在全部邮件中。
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={archiveAction.isExecuting}
                    onClick={() => setConfirmationOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={busy || !selectedIds.length}
                    onClick={() =>
                      archiveAction.execute({
                        version: data.version,
                        requestId: randomUuid(),
                        messageIds: selectedIds,
                      })
                    }
                  >
                    执行归档
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </LoadingContent>
    </PageWrapper>
  );
}

/** Fetch only the current authenticated account's synthetic mailbox. */
async function loadMailbox([url, emailAccountId]: [
  string,
  string,
]): Promise<MailTriageResponse> {
  const response = await fetchWithAccount({
    url,
    emailAccountId,
    init: { cache: "no-store" },
  });
  if (!response.ok) throw new Error("测试邮箱加载失败，请重试");
  return response.json();
}
