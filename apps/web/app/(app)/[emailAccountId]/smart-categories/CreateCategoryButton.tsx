"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  createCategoryBody,
  type CreateCategoryBody,
} from "@/utils/actions/categorize.validation";
import { createCategoryAction } from "@/utils/actions/categorize";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Category } from "@/generated/prisma/client";
import { MessageText } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";

type ExampleCategory = {
  name: string;
  description: string;
};

const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    name: "团队",
    description: "使用 @company.com 邮箱的内部成员，包括员工和同事",
  },
  {
    name: "客户",
    description: "客户邮箱，包括寻求支持或与客户服务团队联系的人员",
  },
  {
    name: "候选人",
    description: "求职者、潜在雇员及面试候选人",
  },
  {
    name: "求职申请",
    description: "已申请或正在面试的公司、招聘平台及招聘人员",
  },
  {
    name: "投资者",
    description: "当前及潜在投资者、投资机构和风投联系人",
  },
  {
    name: "创业者",
    description: "寻求投资或合作的创业者及潜在被投公司",
  },
  {
    name: "供应商",
    description: "为公司提供产品或服务的供应商和合作伙伴",
  },
  {
    name: "服务器错误",
    description: "自动监控服务和错误报告系统",
  },
  {
    name: "媒体",
    description: "寻求采访或报道的记者、媒体、公关机构和行业刊物",
  },
  {
    name: "会议活动",
    description: "活动主办方、会议协调人员及行业演讲联系人",
  },
  {
    name: "公益组织",
    description: "慈善机构、非政府组织、公益组织和基金会",
  },
];

export function CreateCategoryButton({
  buttonProps,
}: {
  buttonProps?: ButtonProps;
}) {
  const { isModalOpen, openModal, closeModal, setIsModalOpen } = useModal();

  return (
    <div>
      <Button onClick={openModal} variant="outline" {...buttonProps}>
        {buttonProps?.children ?? (
          <>
            <PlusIcon className="mr-2 size-4" />
            添加
          </>
        )}
      </Button>

      <CreateCategoryDialog
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        closeModal={closeModal}
      />
    </div>
  );
}

export function CreateCategoryDialog({
  category,
  isOpen,
  onOpenChange,
  closeModal,
}: {
  category?: Pick<Category, "name" | "description">;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  closeModal: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建分类</DialogTitle>
        </DialogHeader>

        <CreateCategoryForm category={category} closeModal={closeModal} />
      </DialogContent>
    </Dialog>
  );
}

function CreateCategoryForm({
  category,
  closeModal,
}: {
  category?: Pick<Category, "name" | "description"> & { id?: string };
  closeModal: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<CreateCategoryBody>({
    resolver: zodResolver(createCategoryBody),
    defaultValues: {
      id: category?.id,
      name: category?.name,
      description: category?.description,
    },
  });

  const handleExampleClick = useCallback(
    (category: ExampleCategory) => {
      setValue("name", category.name);
      setValue("description", category.description);
    },
    [setValue],
  );

  const onSubmit: SubmitHandler<CreateCategoryBody> = useCallback(
    async (data) => {
      const result = await createCategoryAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          description: `创建分类失败。${result.serverError || ""}`,
        });
      } else {
        toastSuccess({ description: "分类已创建！" });
        closeModal();
      }
    },
    [closeModal, emailAccountId],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="名称"
        registerProps={register("name", { required: true })}
        error={errors.name}
      />
      <Input
        type="text"
        autosizeTextarea
        rows={2}
        name="description"
        label="说明（可选）"
        explainText="AI 分类发件人时参考的补充信息"
        registerProps={register("description")}
        error={errors.description}
      />

      <div className="rounded border border-border bg-muted/50 p-3">
        <div className="text-xs font-medium">示例</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {EXAMPLE_CATEGORIES.map((category) => (
            <Button
              key={category.name}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => handleExampleClick(category)}
            >
              <PlusIcon className="mr-1 size-2" />
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      {category && (
        <MessageText>
          修改分类名称或说明仅影响后续分类，已有邮件地址的分类不变。
        </MessageText>
      )}

      <Button type="submit" loading={isSubmitting}>
        {category ? "更新" : "创建"}
      </Button>
    </form>
  );
}
