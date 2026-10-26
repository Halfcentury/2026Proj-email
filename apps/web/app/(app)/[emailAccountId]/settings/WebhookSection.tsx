"use client";

import { useState } from "react";
import { CopyInput } from "@/components/CopyInput";
import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { env } from "@/env";

export function WebhookSection() {
  if (env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED === false) return null;

  return <WebhookSectionContent />;
}

function WebhookSectionContent() {
  const { data, isLoading, error, mutate } = useUser();
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Webhook 密钥</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setGeneratedSecret(null);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {data?.hasWebhookSecret ? "管理密钥" : "生成密钥"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook 密钥</DialogTitle>
              <DialogDescription>
                配置 Webhook 时将此密钥放入 X-Webhook-Secret
                请求头。已有密钥不会再次显示，新生成后请在关闭弹窗前复制。
              </DialogDescription>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              {data && (
                <div className="space-y-4">
                  {generatedSecret ? (
                    <CopyInput value={generatedSecret} masked />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      生成新 Webhook 密钥，仅显示一次供复制。
                    </p>
                  )}
                  <RegenerateSecretButton
                    hasSecret={data.hasWebhookSecret}
                    mutate={mutate}
                    onGenerated={setGeneratedSecret}
                  />
                </div>
              )}
            </LoadingContent>
          </DialogContent>
        </Dialog>
      </ItemActions>
    </Item>
  );
}
