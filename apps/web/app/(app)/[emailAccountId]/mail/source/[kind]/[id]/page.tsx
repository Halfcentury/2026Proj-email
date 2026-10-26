"use client";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getWorkspaceSourceAction } from "@/utils/actions/email-workspace";
import { isSafeContextHref } from "@/utils/ai/email-workspace/types";
import { getActionErrorMessage } from "@/utils/error";
import { Button } from "@/components/ui/button";

export default function WorkspaceSourcePage() {
  const { emailAccountId } = useAccount();
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const connection = useSearchParams().get("connection") ?? undefined;
  const { data, error, isLoading } = useSWR(
    ["workspace-source", emailAccountId, kind, id, connection],
    async () => {
      if (kind !== "reply-memory" && kind !== "attachment")
        throw new Error("来源类型无效。");
      const result = await getWorkspaceSourceAction(emailAccountId, {
        kind,
        id,
        connection,
      });
      if (!result?.data) throw new Error(getActionErrorMessage(result ?? {}));
      return result.data;
    },
  );
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 overflow-auto p-6">
      <Button variant="outline" size="sm" onClick={() => window.history.back()}>
        返回邮件
      </Button>
      {isLoading && <p role="status">正在读取来源…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}
      {data && (
        <>
          <h1 className="text-xl font-medium">{data.title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.scope} · {new Date(data.observedAt).toLocaleString("zh-CN")}
          </p>
          <p className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-7">
            {data.content}
          </p>
          {isSafeContextHref(data.href) && (
            <Button asChild variant="outline">
              <Link href={data.href} target="_blank" rel="noopener noreferrer">
                在云盘中打开文件
              </Link>
            </Button>
          )}
        </>
      )}
    </main>
  );
}
