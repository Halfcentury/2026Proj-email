"use client";

import { useRef } from "react";
import type { KeyedMutator } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createKnowledgeBody,
  type CreateKnowledgeBody,
  updateKnowledgeBody,
  type UpdateKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import {
  createKnowledgeAction,
  updateKnowledgeAction,
} from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@/generated/prisma/client";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils";
import { useAccount } from "@/providers/EmailAccountProvider";

export function KnowledgeForm({
  closeDialog,
  refetch,
  editingItem,
}: {
  closeDialog: () => void;
  refetch: KeyedMutator<GetKnowledgeResponse>;
  editingItem: Knowledge | null;
  knowledgeItemsCount: number;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeBody | UpdateKnowledgeBody>({
    resolver: zodResolver(
      editingItem ? updateKnowledgeBody : createKnowledgeBody,
    ),
    defaultValues: editingItem
      ? {
          id: editingItem.id,
          title: editingItem.title,
          content: editingItem.content,
        }
      : {
          title: "如何起草回复",
          content: "",
        },
  });

  const editorRef = useRef<TiptapHandle>(null);

  const onSubmit = async (data: CreateKnowledgeBody | UpdateKnowledgeBody) => {
    const markdownContent = editorRef.current?.getMarkdown();

    const submitData = {
      ...data,
      content: markdownContent ?? "",
    };

    const result = editingItem
      ? await updateKnowledgeAction(
          emailAccountId,
          submitData as UpdateKnowledgeBody,
        )
      : await createKnowledgeAction(emailAccountId, submitData);

    if (result?.serverError) {
      toastError({
        title: "知识库条目操作失败",
        description: result.serverError || "",
      });
      return;
    }

    toastSuccess({
      description: "知识库条目已保存",
    });

    refetch();
    closeDialog();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="title"
        label="标题"
        registerProps={register("title")}
        error={errors.title}
      />
      <div>
        <Label
          htmlFor="content"
          className={cn(errors.content && "text-destructive")}
        >
          内容（支持 Markdown）
        </Label>
        <Controller
          name="content"
          control={control}
          render={({ field }) => (
            <div className="max-h-[600px] overflow-y-auto">
              <Tiptap
                ref={editorRef}
                initialContent={field.value ?? ""}
                input="markdown"
                className="mt-1 prose prose-sm dark:prose-invert max-w-none"
                autofocus={false}
              />
            </div>
          )}
        />
        {errors.content && (
          <p className="mt-1 text-sm text-destructive">
            {errors.content.message}
          </p>
        )}
      </div>
      <Button type="submit" loading={isSubmitting}>
        {editingItem ? "更新" : "创建"}
      </Button>
    </form>
  );
}
