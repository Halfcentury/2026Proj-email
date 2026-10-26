"use client";

import { useQueryState } from "nuqs";
import { useCallback, useState, useEffect } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteKnowledgeAction } from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { formatDateSimple } from "@/utils/date";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { KnowledgeForm } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeForm";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@/generated/prisma/client";

export function KnowledgeBase() {
  const { emailAccountId } = useAccount();
  const [knowledgeId, setKnowledgeId] = useQueryState("knowledge-id");
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Knowledge | null>(null);
  const { data, isLoading, error, mutate } =
    useSWR<GetKnowledgeResponse>("/api/knowledge");

  useEffect(() => {
    if (knowledgeId && data?.items) {
      setEditingItem(
        data.items.find((item) => item.id === knowledgeId) ?? null,
      );
    }
  }, [knowledgeId, data?.items]);
  const handleClose = useCallback(() => {
    if (knowledgeId) setKnowledgeId(null);
    setIsOpen(false);
    setEditingItem(null);
  }, [knowledgeId, setKnowledgeId]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setEditingItem(null);
        if (knowledgeId) setKnowledgeId(null);
      }
      setIsOpen(open);
    },
    [knowledgeId, setKnowledgeId],
  );

  return (
    <div>
      <Dialog open={isOpen || !!editingItem} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            添加
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "编辑知识" : "添加知识"}</DialogTitle>
          </DialogHeader>
          <KnowledgeForm
            key={editingItem?.id ?? "new"}
            closeDialog={handleClose}
            refetch={mutate}
            editingItem={editingItem}
            knowledgeItemsCount={data?.items.length || 0}
          />
        </DialogContent>
      </Dialog>

      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>暂无知识库条目</EmptyTitle>
                        <EmptyDescription>
                          添加工作、项目或偏好信息，助手起草回复时会参考这些内容。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => (
                  <KnowledgeTableRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditingItem(item)}
                    onDelete={mutate}
                    emailAccountId={emailAccountId}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </div>
  );
}

function KnowledgeTableRow({
  item,
  onEdit,
  onDelete,
  emailAccountId,
}: {
  item: Knowledge;
  onEdit: () => void;
  onDelete: () => void;
  emailAccountId: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <TableRow>
      <TableCell>{item.title}</TableCell>
      <TableCell>{formatDateSimple(new Date(item.updatedAt))}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            编辑
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" loading={isDeleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="删除知识库条目"
            description={`确定删除“${item.title}”吗？此操作无法撤销。`}
            confirmText="删除"
            onConfirm={async () => {
              try {
                setIsDeleting(true);
                const result = await deleteKnowledgeAction(emailAccountId, {
                  id: item.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: "删除知识库条目失败",
                    description: result.serverError || "",
                  });
                  return;
                }
                toastSuccess({
                  description: "知识库条目已删除",
                });
                onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
