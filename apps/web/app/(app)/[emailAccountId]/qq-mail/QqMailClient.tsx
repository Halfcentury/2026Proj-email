"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveIcon,
  DownloadIcon,
  InboxIcon,
  Loader2Icon,
  MailOpenIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserRoundXIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/components/Toast";
import {
  archiveImapMessagesAction,
  archiveImapSenderAction,
  connectImapAccountAction,
  disconnectImapAccountAction,
  getImapMessageAction,
  getQqMessagesAction,
  listImapMessagesAction,
  summarizeQqMessagesAction,
  syncQqMessagesAction,
} from "@/utils/actions/qq-mail";
import type {
  ImapAccountSummary,
  ImapInboxPage,
  ImapMessageDetail,
  QqMailboxState,
  QqMailboxSummary,
} from "@/utils/qq-mail/types";
import { cn } from "@/utils";

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "zh-CN",
    sameYear
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" },
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function senderEmail(from: string) {
  const match = /<([^>]+)>/.exec(from);
  return (match?.[1] ?? from).trim();
}

const CATEGORY_LABELS: Record<string, string> = {
  action_required: "待处理",
  information: "仅知悉",
  marketing: "营销",
  manual_review: "需人工核查",
};

const CATEGORY_STYLES: Record<string, string> = {
  action_required: "bg-amber-100 text-amber-800",
  information: "bg-sky-100 text-sky-800",
  marketing: "bg-rose-100 text-rose-800",
  manual_review: "bg-slate-200 text-slate-700",
  unclassified: "bg-slate-100 text-slate-600",
};

export function QqMailClient({
  initialAccounts,
}: {
  initialAccounts: ImapAccountSummary[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    initialAccounts[0]?.id ?? null,
  );
  const activeAccount = useMemo(
    () =>
      accounts.find((account) => account.id === activeAccountId) ??
      accounts[0] ??
      null,
    [accounts, activeAccountId],
  );

  const [email, setEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [inbox, setInbox] = useState<ImapInboxPage | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const [activeUid, setActiveUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<ImapMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [limit, setLimit] = useState(50);
  const [syncing, setSyncing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiState, setAiState] = useState<QqMailboxState | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [summary, setSummary] = useState<QqMailboxSummary | null>(null);

  const accountId = activeAccount?.id ?? null;

  const loadPage = useCallback(async (id: string, nextPage: number) => {
    setLoadingList(true);
    setListError(null);
    try {
      const result = await listImapMessagesAction({
        accountId: id,
        page: nextPage,
      });
      if (result?.serverError) throw new Error(result.serverError);
      if (result?.data) {
        setInbox(result.data);
        setPage(result.data.page);
        setSelected(new Set());
      }
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "加载收件箱失败，请重试",
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadAiState = useCallback(async (id: string) => {
    try {
      const result = await getQqMessagesAction({ accountId: id });
      if (result?.data) setAiState(result.data);
    } catch {
      // The stored snapshot is optional; syncing recreates it.
    }
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setActiveUid(null);
    setDetail(null);
    setDetailError(null);
    setInbox(null);
    setSummary(null);
    setCategoryFilter("all");
    loadPage(accountId, 1).catch(() => undefined);
    loadAiState(accountId).catch(() => undefined);
  }, [accountId, loadPage, loadAiState]);

  function toggleSelected(uid: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(uid);
      else next.delete(uid);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (!inbox) return;
    setSelected(
      checked
        ? new Set(inbox.messages.map((message) => message.uid))
        : new Set(),
    );
  }

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectImapAccountAction({ email, authCode });
      if (result?.serverError) throw new Error(result.serverError);
      const nextAccounts = result?.data?.accounts ?? [];
      setAccounts(nextAccounts);
      const normalizedEmail = email.trim().toLowerCase();
      const connected = nextAccounts.find(
        (account) => account.email === normalizedEmail,
      );
      setActiveAccountId(connected?.id ?? nextAccounts[0]?.id ?? null);
      setEmail("");
      setAuthCode("");
      setNotice("QQ 邮箱连接成功");
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : "连接失败，请重试",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleOpen(uid: number) {
    if (!accountId) return;
    setActiveUid(uid);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const result = await getImapMessageAction({ accountId, uid });
      if (result?.serverError) throw new Error(result.serverError);
      setDetail(result?.data ?? null);
      setInbox((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.uid === uid ? { ...message, unread: false } : message,
              ),
            }
          : current,
      );
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "读取邮件失败，请重试",
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleArchiveSelected() {
    if (!accountId || selected.size === 0) return;
    setArchiving(true);
    setListError(null);
    try {
      const result = await archiveImapMessagesAction({
        accountId,
        uids: [...selected],
      });
      if (result?.serverError) throw new Error(result.serverError);
      const archived = result?.data?.archived ?? 0;
      setActiveUid(null);
      setDetail(null);
      await loadPage(accountId, page);
      setNotice(
        `已把 ${archived} 封邮件归档到「${activeAccount?.archiveFolder ?? "已归档"}」`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "归档失败，请重试";
      setListError(message);
      toastError({ description: message });
    } finally {
      setArchiving(false);
    }
  }

  async function handleArchiveSender(from: string) {
    if (!accountId) return;
    const address = senderEmail(from);
    if (!address) return;
    if (!window.confirm(`把收件箱里来自 ${address} 的全部邮件归档？`)) return;

    setArchiving(true);
    setListError(null);
    try {
      const result = await archiveImapSenderAction({
        accountId,
        from: address,
      });
      if (result?.serverError) throw new Error(result.serverError);
      const archived = result?.data?.archived ?? 0;
      setActiveUid(null);
      setDetail(null);
      await loadPage(accountId, 1);
      setNotice(
        archived > 0
          ? `已归档来自 ${address} 的 ${archived} 封邮件`
          : `收件箱里没有来自 ${address} 的邮件`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "归档失败，请重试";
      setListError(message);
      toastError({ description: message });
    } finally {
      setArchiving(false);
    }
  }

  async function handleDisconnect() {
    if (!accountId) return;
    if (
      !window.confirm(
        "断开这个 QQ 邮箱？只会删除本地保存的授权码，不影响邮箱里的邮件。",
      )
    ) {
      return;
    }
    try {
      const result = await disconnectImapAccountAction({ accountId });
      if (result?.serverError) throw new Error(result.serverError);
      const nextAccounts = result?.data?.accounts ?? [];
      setAccounts(nextAccounts);
      setActiveAccountId(nextAccounts[0]?.id ?? null);
      setInbox(null);
      setDetail(null);
      setNotice("已断开该邮箱");
    } catch (error) {
      toastError({
        description:
          error instanceof Error ? error.message : "断开失败，请重试",
      });
    }
  }

  async function handleSync() {
    if (!accountId) return;
    setSyncing(true);
    setAiError(null);
    setSummary(null);
    try {
      const result = await syncQqMessagesAction({ accountId, limit });
      if (result?.serverError) throw new Error(result.serverError);
      if (result?.data) {
        setAiState(result.data);
        setNotice(`已抓取 ${result.data.total} 封邮件，并完成 AI 分类`);
      }
      await loadPage(accountId, 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "抓取失败，请重试";
      setAiError(message);
      toastError({ description: message });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSummarize() {
    if (!accountId) return;
    setSummarizing(true);
    setAiError(null);
    try {
      const result = await summarizeQqMessagesAction({ accountId });
      if (result?.serverError) throw new Error(result.serverError);
      setSummary(result?.data ?? null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "汇总失败，请重试";
      setAiError(message);
      toastError({ description: message });
    } finally {
      setSummarizing(false);
    }
  }

  const totalPages = inbox
    ? Math.max(1, Math.ceil(inbox.total / inbox.pageSize))
    : 1;
  const allSelected = Boolean(
    inbox &&
      inbox.messages.length > 0 &&
      inbox.messages.every((message) => selected.has(message.uid)),
  );
  const filteredAiMessages = useMemo(() => {
    if (!aiState) return [];
    if (categoryFilter === "all") return aiState.messages;
    if (categoryFilter === "unclassified")
      return aiState.messages.filter((message) => !message.category);
    return aiState.messages.filter(
      (message) => message.category === categoryFilter,
    );
  }, [aiState, categoryFilter]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">QQ 邮箱</h1>
          <p className="text-sm text-muted-foreground">
            通过 IMAP 连接真实 QQ 邮箱，查看收件箱并把邮件归档到「
            {activeAccount?.archiveFolder ?? "已归档"}」文件夹。
          </p>
        </div>
        {activeAccount ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{activeAccount.email}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => activeAccount && loadPage(activeAccount.id, page)}
              disabled={loadingList}
            >
              <RefreshCwIcon
                className={cn("size-4", loadingList && "animate-spin")}
              />
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              <UserRoundXIcon className="size-4" />
              断开
            </Button>
          </div>
        ) : null}
      </div>

      {accounts.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <Button
              key={account.id}
              size="sm"
              variant={account.id === activeAccount?.id ? "default" : "outline"}
              onClick={() => setActiveAccountId(account.id)}
            >
              {account.email}
            </Button>
          ))}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {activeAccount ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SparklesIcon className="size-4" />
              AI 分类与汇总
            </CardTitle>
            <CardDescription>
              抓取 QQ 收件箱邮件，用 DeepSeek 按属性分类，并生成整体汇总。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label
                  htmlFor="sync-limit"
                  className="text-xs text-muted-foreground"
                >
                  抓取范围
                </Label>
                <select
                  id="sync-limit"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  disabled={syncing}
                >
                  <option value={30}>最近 30 封</option>
                  <option value={50}>最近 50 封</option>
                  <option value={100}>最近 100 封</option>
                  <option value={200}>最近 200 封</option>
                </select>
              </div>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={syncing || summarizing}
              >
                {syncing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <DownloadIcon className="size-4" />
                )}
                一键抓取并分类
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSummarize}
                disabled={summarizing || !aiState?.total}
              >
                {summarizing ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                AI 汇总
              </Button>
              {aiState ? (
                <span className="text-xs text-muted-foreground">
                  已入库 {aiState.total} 封
                </span>
              ) : null}
            </div>

            {aiError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {aiError}
              </p>
            ) : null}

            {aiState && aiState.total > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "all", label: "全部", count: aiState.total },
                    {
                      key: "action_required",
                      label: "待处理",
                      count: aiState.counts.action_required,
                    },
                    {
                      key: "information",
                      label: "仅知悉",
                      count: aiState.counts.information,
                    },
                    {
                      key: "marketing",
                      label: "营销",
                      count: aiState.counts.marketing,
                    },
                    {
                      key: "manual_review",
                      label: "需人工核查",
                      count: aiState.counts.manual_review,
                    },
                    ...(aiState.counts.unclassified
                      ? [
                          {
                            key: "unclassified",
                            label: "未分类",
                            count: aiState.counts.unclassified,
                          },
                        ]
                      : []),
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setCategoryFilter(chip.key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        categoryFilter === chip.key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground",
                      )}
                    >
                      {chip.label} {chip.count}
                    </button>
                  ))}
                </div>

                <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                  {filteredAiMessages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      该分类下没有邮件
                    </p>
                  ) : (
                    filteredAiMessages.map((message) => (
                      <button
                        key={message.uid}
                        type="button"
                        onClick={() => handleOpen(message.uid)}
                        className="flex w-full items-start gap-2 rounded-md border p-2 text-left hover:bg-muted/50"
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                            CATEGORY_STYLES[
                              message.category ?? "unclassified"
                            ] ?? CATEGORY_STYLES.unclassified,
                          )}
                        >
                          {CATEGORY_LABELS[message.category ?? ""] ?? "未分类"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {message.subject}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {message.fromAddress || "未知发件人"}
                            {message.aiSummary ? ` · ${message.aiSummary}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(message.receivedAt)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}

            {summary ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
                <p className="whitespace-pre-wrap">{summary.overview}</p>
                {summary.todos.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium">待办事项</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {summary.todos.map((todo, index) => (
                        <li key={`${todo.title}-${index}`}>
                          {todo.title}
                          {todo.deadline ? `（${todo.deadline}）` : ""}
                          {todo.from ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {todo.from}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {summary.important.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium">重要通知</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {summary.important.map((item, index) => (
                        <li key={`${item.title}-${index}`}>
                          {item.title}
                          {item.why ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {item.why}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {summary.marketing.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium">营销/订阅</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {summary.marketing.map((item, index) => (
                        <li key={`${item.from}-${index}`}>
                          {item.from}
                          {item.note ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {item.note}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!activeAccount ? (
        <Card>
          <CardHeader>
            <CardTitle>连接 QQ 邮箱</CardTitle>
            <CardDescription>
              使用邮箱授权码通过 IMAP 连接，不需要 OAuth，也不会经过 Google /
              Microsoft。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleConnect}
              className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            >
              <div className="space-y-2">
                <Label htmlFor="qq-email">邮箱地址</Label>
                <Input
                  id="qq-email"
                  type="email"
                  autoComplete="username"
                  placeholder="yourname@qq.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qq-auth-code">授权码</Label>
                <Input
                  id="qq-auth-code"
                  type="password"
                  autoComplete="current-password"
                  placeholder="16 位授权码"
                  value={authCode}
                  onChange={(event) => setAuthCode(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={connecting}>
                {connecting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                连接邮箱
              </Button>
            </form>

            {connectError ? (
              <p className="mt-3 text-sm text-red-600">{connectError}</p>
            ) : null}

            <div className="mt-5 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">如何获取授权码</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>登录 QQ 邮箱网页版 → 设置 → 账号</li>
                <li>开启「IMAP/SMTP 服务」（需要短信验证）</li>
                <li>生成 16 位授权码，填到上面（不是 QQ 登录密码）</li>
              </ol>
              <p className="mt-2">
                服务器：imap.qq.com（993，SSL）。连接后会创建一个「已归档」文件夹存放归档邮件。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <InboxIcon className="size-4" />
                收件箱
              </CardTitle>
              <CardDescription>
                共 {inbox?.total ?? 0} 封 · 第 {page} / {totalPages} 页
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    aria-label="全选本页"
                    checked={allSelected}
                    onCheckedChange={(value) => toggleSelectAll(value === true)}
                    disabled={!inbox?.messages.length}
                  />
                  全选本页
                </span>
                <Button
                  size="sm"
                  onClick={handleArchiveSelected}
                  disabled={archiving || selected.size === 0}
                >
                  {archiving ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <ArchiveIcon className="size-4" />
                  )}
                  归档选中（{selected.size}）
                </Button>
              </div>

              {listError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {listError}
                </p>
              ) : null}

              <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
                {loadingList ? (
                  <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    正在读取收件箱…
                  </div>
                ) : inbox?.messages.length ? (
                  inbox.messages.map((message) => (
                    <div
                      key={message.uid}
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-2",
                        activeUid === message.uid && "bg-muted",
                      )}
                    >
                      <Checkbox
                        checked={selected.has(message.uid)}
                        onCheckedChange={(value) =>
                          toggleSelected(message.uid, value === true)
                        }
                        className="mt-1"
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => handleOpen(message.uid)}
                      >
                        <div className="flex items-center gap-2">
                          {message.unread ? (
                            <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                          ) : null}
                          <span className="truncate text-sm font-medium">
                            {message.from || "(未知发件人)"}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {formatDate(message.date)}
                          </span>
                        </div>
                        <div className="truncate text-sm">
                          {message.subject}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="按发件人归档"
                        disabled={archiving}
                        onClick={() => handleArchiveSender(message.from)}
                      >
                        <ArchiveIcon className="size-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    收件箱是空的
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!activeAccount || page <= 1 || loadingList}
                  onClick={() =>
                    activeAccount && loadPage(activeAccount.id, page - 1)
                  }
                >
                  上一页
                </Button>
                <span className="text-xs text-muted-foreground">
                  第 {page} / {totalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!activeAccount || page >= totalPages || loadingList}
                  onClick={() =>
                    activeAccount && loadPage(activeAccount.id, page + 1)
                  }
                >
                  下一页
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MailOpenIcon className="size-4" />
                邮件内容
              </CardTitle>
              <CardDescription>
                {detail?.subject ?? "从左侧选择一封邮件查看"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detailError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {detailError}
                </p>
              ) : null}

              {loadingDetail ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  正在加载邮件…
                </div>
              ) : detail ? (
                <>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>发件人：{detail.from}</div>
                    <div>收件人：{detail.to}</div>
                    {detail.cc ? <div>抄送：{detail.cc}</div> : null}
                    <div>时间：{formatDate(detail.date)}</div>
                  </div>

                  {detail.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {detail.attachments.map((attachment, index) => (
                        <Badge
                          key={`${attachment.filename}-${index}`}
                          variant="outline"
                        >
                          {attachment.filename}
                          {attachment.size
                            ? ` · ${formatSize(attachment.size)}`
                            : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {detail.html ? (
                    <iframe
                      title="邮件内容"
                      sandbox=""
                      srcDoc={detail.html}
                      className="h-[520px] w-full rounded-md border bg-white"
                    />
                  ) : (
                    <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm">
                      {detail.text || "(无正文)"}
                    </pre>
                  )}
                </>
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  选择一封邮件查看内容
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
