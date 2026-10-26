"use client";
import { useEffect, useState, useId } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getWorkspaceFeedbackSettingsAction } from "@/utils/actions/email-workspace";
import { saveWritingStyleAction } from "@/utils/actions/user";
import { createKnowledgeAction } from "@/utils/actions/knowledge";
import { assertActionSucceeded, getActionErrorMessage } from "@/utils/error";
import { CategorySelect } from "@/components/CategorySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
const RuleDialog = dynamic(() =>
  import("@/app/(app)/[emailAccountId]/assistant/RuleDialog").then(
    (m) => m.RuleDialog,
  ),
);

export function useEmailAiFeedbackState({ threadId }: { threadId: string }) {
  const { emailAccountId } = useAccount();
  const [mode, setMode] = useState<"style" | "knowledge">("style");
  const [style, setStyle] = useState("");
  const [edited, setEdited] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [rule, setRule] = useState<string | null | undefined>();
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR(["workspace-feedback", emailAccountId, threadId], async () => {
    const result = await getWorkspaceFeedbackSettingsAction(emailAccountId, {
      threadId,
    });
    if (!result?.data) throw new Error(getActionErrorMessage(result ?? {}));
    return result.data;
  });
  useEffect(() => {
    if (data && !edited) setStyle(data.writingStyle);
  }, [data, edited]);
  async function save() {
    setPending(true);
    setError("");
    setStatus("");
    try {
      const result =
        mode === "style"
          ? await saveWritingStyleAction(emailAccountId, {
              writingStyle: style,
            })
          : await createKnowledgeAction(emailAccountId, {
              title: title.trim(),
              content: content.trim(),
            });
      assertActionSucceeded(result);
      setStatus(
        mode === "style"
          ? "已保存，以后的回复会参考这些写作偏好。"
          : "已保存到知识库，以后的回复可检索这些事实。",
      );
      if (mode === "style") {
        setEdited(false);
        await mutate();
      } else {
        setTitle("");
        setContent("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setPending(false);
    }
  }
  return {
    emailAccountId,
    mode,
    setMode,
    style,
    setStyle,
    setEdited,
    title,
    setTitle,
    content,
    setContent,
    pending,
    status,
    setStatus,
    error,
    rule,
    setRule,
    data,
    loadError,
    mutate,
    save,
  };
}

export function EmailAiFeedback({
  state,
  instructions,
  ruleIds,
}: {
  state: ReturnType<typeof useEmailAiFeedbackState>;
  instructions: string;
  ruleIds: { id: string; name: string }[];
}) {
  const styleInputId = useId();
  const {
    emailAccountId,
    mode,
    setMode,
    style,
    setStyle,
    setEdited,
    title,
    setTitle,
    content,
    setContent,
    pending,
    status,
    setStatus,
    error,
    rule,
    setRule,
    data,
    loadError,
    mutate,
    save,
  } = state;
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        反馈与以后如何处理
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          “本次回复要求”仅用于当前草稿。以下修改在确认保存后影响后续邮件。
        </p>
        <label className="block space-y-1 text-xs">
          保存内容
          <select
            aria-label="反馈类型"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setStatus("");
            }}
          >
            <option value="style">以后这样写（写作偏好）</option>
            <option value="knowledge">补充业务事实（知识库）</option>
          </select>
        </label>
        {mode === "style" ? (
          <>
            <label htmlFor={styleInputId} className="block space-y-1 text-xs">
              完整写作偏好
              <Textarea
                id={styleInputId}
                aria-label="以后使用的写作偏好"
                value={style}
                maxLength={2000}
                onChange={(e) => {
                  setStyle(e.target.value);
                  setEdited(true);
                }}
              />
            </label>
            {instructions.trim() && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStyle(
                    [style, instructions.trim()]
                      .filter(Boolean)
                      .join("\n")
                      .slice(0, 2000),
                  );
                  setEdited(true);
                }}
              >
                加入本次回复要求，保存前可修改
              </Button>
            )}
          </>
        ) : (
          <>
            <Input
              aria-label="知识标题"
              placeholder="知识标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              aria-label="知识内容"
              placeholder="填写已经确认的业务事实"
              value={content}
              maxLength={10_000}
              onChange={(e) => setContent(e.target.value)}
            />
          </>
        )}
        <Button
          size="sm"
          disabled={
            pending ||
            !data ||
            (mode === "knowledge" && (!title.trim() || !content.trim()))
          }
          onClick={save}
        >
          {pending ? "正在保存…" : "确认保存"}
        </Button>
        {status && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
        {(error || loadError) && (
          <p role="alert" className="text-xs text-destructive">
            {error || "无法读取现有偏好，请刷新后重试。"}
          </p>
        )}
        {data && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs">纠正发件人分类：{data.sender}</p>
            <CategorySelect
              emailAccountId={emailAccountId}
              sender={data.sender}
              categories={data.categories}
              senderCategory={data.categoryId ? { id: data.categoryId } : null}
              onSuccess={() => mutate()}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => setRule(null)}>
            创建处理规则
          </Button>
          {ruleIds.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant="outline"
              onClick={() => setRule(item.id)}
            >
              修改规则：{item.name}
            </Button>
          ))}
        </div>
        {rule !== undefined && (
          <RuleDialog
            isOpen
            ruleId={rule ?? undefined}
            editMode={Boolean(rule)}
            onClose={() => setRule(undefined)}
          />
        )}
      </div>
    </details>
  );
}
