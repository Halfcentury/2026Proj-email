"use client";
import { useState } from "react";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getWorkspaceReplyMessageAction } from "@/utils/actions/email-workspace";
import { prepareReplyingToEmail } from "@/utils/email/replying-to-email";
import { getActionErrorMessage } from "@/utils/error";
import Link from "next/link";
import {
  emailWorkspaceResultSchema,
  isSafeContextHref,
} from "@/utils/ai/email-workspace/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function EmailWorkspaceToolResult({ output }: { output: unknown }) {
  const { popOutReply } = useComposeModal();
  const { emailAccountId } = useAccount();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const parsed = emailWorkspaceResultSchema.safeParse(output);
  if (!parsed.success)
    return (
      <p className="text-sm text-destructive">邮件处理结果不可用，请重试。</p>
    );
  const result = parsed.data;
  async function editReply() {
    if (!result.draft || result.emailAccountId !== emailAccountId) return;
    setEditing(true);
    setError("");
    try {
      const response = await getWorkspaceReplyMessageAction(emailAccountId, {
        threadId: result.threadId,
        messageId: result.messageId,
      });
      if (!response?.data)
        throw new Error(getActionErrorMessage(response ?? {}));
      popOutReply({
        emailAccountId,
        draftSessionId: `ai-reply:${result.aiRunId}`,
        draftKeyMessageId: response.data.id,
        draftMode: "reply",
        useLegacyDraft: false,
        suggestedAttachments: result.draft.attachments,
        replyingToEmail: {
          ...prepareReplyingToEmail(response.data),
          draftHtml: result.draft.html,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开草稿");
    } finally {
      setEditing(false);
    }
  }
  return (
    <Card>
      <CardHeader className="px-4 py-3 font-medium text-sm">
        {result.kind === "analysis" ? "邮件分析" : "回复草稿"}
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-sm">
        <p className="whitespace-pre-wrap leading-6">
          {result.analysis?.summary ?? result.draft?.text}
        </p>
        {result.analysis?.replyReason && (
          <p className="text-muted-foreground">{result.analysis.replyReason}</p>
        )}
        {result.missingInformation.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="font-medium">待确认</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {result.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {result.issues.map((issue) => (
          <p key={issue.source + issue.message} className="text-amber-700">
            {issue.source}：{issue.message}
          </p>
        ))}
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            资料来源（{result.sources.length}）
          </summary>
          <div className="mt-2 space-y-3">
            {result.sources.map((source) => (
              <div key={source.id}>
                <p className="font-medium">
                  {isSafeContextHref(source.href) ? (
                    <Link className="underline" href={source.href}>
                      {source.title}
                    </Link>
                  ) : (
                    source.title
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {source.excerpt}
                </p>
              </div>
            ))}
          </div>
        </details>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {result.draft && (
          <Button
            size="sm"
            disabled={editing || result.emailAccountId !== emailAccountId}
            onClick={editReply}
          >
            {editing ? "正在打开…" : "在写信窗口编辑"}
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/${encodeURIComponent(result.emailAccountId)}/mail?thread-id=${encodeURIComponent(result.threadId)}`}
          >
            打开原邮件
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
