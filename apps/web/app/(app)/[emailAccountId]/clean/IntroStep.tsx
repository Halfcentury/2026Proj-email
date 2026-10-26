"use client";

import Image from "next/image";
import { SectionDescription } from "@/components/Typography";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { CleanAction } from "@/generated/prisma/enums";

export function IntroStep({
  unhandledCount,
  cleanAction,
}: {
  unhandledCount: number;
  cleanAction: CleanAction;
}) {
  const { onNext } = useStep();

  return (
    <div>
      {null}
      <div className="text-center">
        <Image
          src="/images/illustrations/home-office.svg"
          alt="整理"
          width={200}
          height={200}
          className="mx-auto dark:brightness-90 dark:invert"
          unoptimized
        />

        <TypographyH3 className="mt-2">快速整理收件箱</TypographyH3>

        {unhandledCount === null ? (
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            正在检查收件箱…
          </SectionDescription>
        ) : (
          <>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              你有 {unhandledCount.toLocaleString("zh-CN")}{" "}
              {cleanAction === CleanAction.ARCHIVE ? "unarchived" : "unread"}{" "}
              封收件箱邮件。
            </SectionDescription>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              整理收件箱并保留重要邮件。
            </SectionDescription>
          </>
        )}

        <div className="mt-6">
          <Button
            onClick={() => {
              onNext();
            }}
            disabled={unhandledCount === null}
          >
            下一步
          </Button>
        </div>
      </div>
    </div>
  );
}
