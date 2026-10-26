"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/Typography";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";

export function LearnedPatternsSetting() {
  return (
    <SettingCard
      title="已学习的规律"
      description="查看助手从邮件历史中学习的规律。"
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              查看
            </Button>
          </DialogTrigger>
          {/* Scroll inside the content row (not DialogContent itself) so the close button stays visible */}
          <DialogContent className="max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <DialogHeader>
              <DialogTitle>已学习的规律</DialogTitle>
              <DialogDescription>
                AI
                会在处理邮件时学习哪些发件人或邮件类型经常匹配同一规则。例如，newsletter@example.com
                的邮件始终匹配“订阅邮件”规则。这些规律有助于更快、更准确地处理邮件，你可以查看、编辑或删除它们。
              </DialogDescription>
            </DialogHeader>
            <div className="min-w-0 overflow-y-auto">
              <Content />
            </div>
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function Content() {
  const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.groups.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <TypographyP>暂无学习规律。</TypographyP>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data?.groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>{group.rule?.name || "No rule"}</CardTitle>
              </CardHeader>
              <CardContent>
                <ViewLearnedPatterns groupId={group.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </LoadingContent>
  );
}
