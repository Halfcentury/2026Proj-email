import Link from "next/link";
import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("使用说明"),
  description: "邮箱连接、邮件整理、自动化、日历和账户设置的使用说明。",
};

/** 展示中文使用说明及常用功能入口。 */
export default function HelpPage() {
  return (
    <BasicLayout>
      <article className="mx-auto max-w-3xl space-y-8 py-12 leading-8">
        <div>
          <h1 className="text-3xl font-semibold">{BRAND_NAME}使用说明</h1>
          <p className="mt-4 text-muted-foreground">
            连接邮箱，按自己的工作方式整理邮件。
          </p>
        </div>
        <section>
          <h2 className="text-xl font-semibold">连接邮箱</h2>
          <p>
            通过 Google 或 Microsoft
            登录并完成邮箱授权。在账户页面可以添加邮箱、重新连接账户或切换邮箱。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">查看和处理邮件</h2>
          <p>
            在收件箱搜索和阅读邮件，使用星标标记重要内容。工具栏可归档、标记已读、移动或添加标签；写邮件时可保存草稿、添加附件和设置发送时间。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">邮件整理</h2>
          <p>
            生成整理建议后，查看每封邮件的分类、说明和原文证据。勾选需要归档的邮件，再确认执行；星标和待处理邮件会受到保护。操作日志可查看本次归档记录。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">AI 对话与自动化</h2>
          <p>
            通过对话查找邮件和创建规则。在自动化页面检查规则的匹配条件与操作，配置回复风格、签名、知识库和跟进提醒。会自动发送邮件的规则应在启用前检查。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">批量退订和归档</h2>
          <p>
            按发件人检查不需要的订阅邮件，选择退订或保留。归档只将邮件移出收件箱，仍可在所有邮件中查找。
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">日历、会议与附件</h2>
          <p>
            连接日历后设置时区、可预约时间和预约链接。在会议页面查看记录与纪要，在附件页面连接云盘、配置归档目录并纠正归档结果。
          </p>
        </section>
        <div className="flex gap-6 border-t pt-6">
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:underline"
          >
            登录邮箱
          </Link>
          <Link
            href="/accounts"
            className="font-medium text-blue-600 hover:underline"
          >
            管理账户
          </Link>
        </div>
      </article>
    </BasicLayout>
  );
}
