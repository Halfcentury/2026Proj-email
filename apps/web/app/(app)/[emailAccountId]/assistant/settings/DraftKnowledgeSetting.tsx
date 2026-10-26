"use client";

import { useState } from "react";
import { useQueryState } from "nuqs";
import { SettingCard } from "@/components/SettingCard";
import { useDraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { Tooltip } from "@/components/Tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase";

export function DraftKnowledgeSetting() {
  const { enabled, loading } = useDraftReplies();

  const isEnabled = !loading && enabled;

  const kb = <KnowledgeDialog enabled={isEnabled} />;

  return (
    <SettingCard
      title="回复知识库"
      description="助手起草回复时参考的信息。"
      right={
        isEnabled ? (
          kb
        ) : (
          <Tooltip content="启用回复草稿后可编辑知识库">
            <span>{kb}</span>
          </Tooltip>
        )
      }
    />
  );
}

function KnowledgeDialog({ enabled }: { enabled: boolean }) {
  const [knowledgeId, setKnowledgeId] = useQueryState("knowledge-id");
  const [manualOpen, setManualOpen] = useState(false);
  return (
    <Dialog
      open={manualOpen || Boolean(knowledgeId)}
      onOpenChange={(open) => {
        setManualOpen(open);
        if (!open) setKnowledgeId(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!enabled}>
          管理
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>回复知识库</DialogTitle>
          <DialogDescription>用于帮助助手起草回复。</DialogDescription>
        </DialogHeader>
        <KnowledgeBase />
      </DialogContent>
    </Dialog>
  );
}
