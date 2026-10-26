"use client";

import { Card } from "@/components/ui/card";
import {
  PageSubHeading,
  TypographyH3,
  TypographyH4,
} from "@/components/Typography";
import { ConnectDrive } from "./ConnectDrive";

const steps = [
  {
    number: 1,
    title: "说明整理方式",
    description: "“收据按月份放入费用文件夹，合同放入法务文件夹。”",
  },
  {
    number: 2,
    title: "自动整理附件",
    description: "AI 读取文档并整理到对应文件夹",
  },
  {
    number: 3,
    title: "处理方式由你决定",
    description: "文件整理后收到邮件，可回复进行修正",
  },
];

export function DriveOnboarding() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <TypographyH3 className="text-center">工作时自动整理附件</TypographyH3>

      <div className="mt-10 space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {step.number}
            </div>
            <div>
              <TypographyH4>{step.title}</TypographyH4>
              <PageSubHeading className="mt-1">
                {step.description}
              </PageSubHeading>
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <TypographyH4 className="text-center">附件应整理到哪里？</TypographyH4>
        <div className="mt-4 flex justify-center">
          <ConnectDrive />
        </div>
      </Card>
    </div>
  );
}
