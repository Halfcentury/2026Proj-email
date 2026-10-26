import type {
  DemoInboxAddress,
  DemoInboxFixture,
  DemoInboxMessage,
  DemoInboxThread,
} from "@/__tests__/fixtures/inboxes/types";

export const saasFounderMixedInbox: DemoInboxFixture = {
  id: "saasFounderMixed",
  name: "SaaS 创业者综合收件箱",
  description:
    "包含紧急客户事项、安全与账单提醒、运营摘要、订阅简报、招聘和陌生营销邮件的创业者收件箱。",
  mailbox: {
    email: "alex@northstarhq.com",
    displayName: "亚历克斯·摩根",
    timezone: "America/Los_Angeles",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51c0a769e2f41", [
      message({
        id: "18f51c0b4a9d7c02",
        from: person("玛雅·陈", "maya@acme-customer.com"),
        subject: "请今日审批：第二季度上线文案",
        bodyText:
          "请在下午三点前审批修改后的上线文案。客户团队需要收到您的确认才能继续推进。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-20T16:10:00.000Z",
      }),
      message({
        id: "18f51c0e1d6b90aa",
        from: person("玛雅·陈", "maya@acme-customer.com"),
        subject: "回复：请今日审批：第二季度上线文案",
        bodyText:
          "这里补充了客户的最终意见。您批准标出的段落后，我们就可以发布。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-20T17:25:00.000Z",
      }),
    ]),
    thread("18f51c1517ef3149", [
      message({
        id: "18f51c1674a83c6d",
        from: person("诺拉·帕特尔", "nora@northwindhq.com"),
        subject: "需升级处理：续约条款尚未确定",
        bodyText:
          "明天法务审核前，需要您确认续约条款。如未及时确认，采购部门将暂停续约。",
        unread: true,
        labels: ["INBOX", "待回复", "重要客户"],
        date: "2026-04-21T15:40:00.000Z",
      }),
      message({
        id: "18f51c18ad90ef32",
        from: person("阿里·科恩", "ari@northstarhq.com"),
        subject: "回复：需升级处理：续约条款尚未确定",
        bodyText:
          "我可以协助沟通，但对方希望由您最终确认多年期合同的折扣方案。",
        unread: false,
        labels: ["INBOX", "重要客户"],
        date: "2026-04-21T16:12:00.000Z",
      }),
    ]),
    thread("18f51c1e62cbb940", [
      message({
        id: "18f51c208d54b71a",
        from: person("AWS 安全中心", "no-reply-aws@amazon.com"),
        subject: "生产账户的根用户多重身份验证已停用",
        bodyText:
          "安全提醒：您的生产账户已停用根用户多重身份验证，请立即核查此事件。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T03:05:00.000Z",
      }),
    ]),
    thread("18f51c24d1a6405c", [
      message({
        id: "18f51c25a97eb0d1",
        from: person("Okta 安全中心", "security@okta.com"),
        subject: "检测到新的可疑登录",
        bodyText:
          "检测到您的组织存在新的可疑登录，请核查安全提醒，必要时重置登录凭据。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T07:44:00.000Z",
      }),
    ]),
    thread("18f51c297ab3d84e", [
      message({
        id: "18f51c2a0e832979",
        from: person("Figma 账单", "billing@figma.com"),
        subject: "发票 INV-4432 支付失败",
        bodyText:
          "请更新付款方式，以免服务中断。支付失败的发票编号为 INV-4432。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T21:18:00.000Z",
      }),
    ]),
    thread("18f51c2e4a97b21f", [
      message({
        id: "18f51c2fd2a9146b",
        from: person("Vercel 账单", "billing@vercel.com"),
        subject: "发票支付失败",
        bodyText:
          "请更新 Vercel 团队的付款方式。支付失败可能导致生产部署被停用。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T06:15:00.000Z",
      }),
    ]),
    thread("18f51c34479cb286", [
      message({
        id: "18f51c353f6bd109",
        from: person("SOC2 审计员", "auditor@secureframe.com"),
        subject: "请于周五前提交审计材料",
        bodyText:
          "请在周五的审计检查前上传权限审核材料，目前还缺少管理员角色的导出文件。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-21T19:30:00.000Z",
      }),
      message({
        id: "18f51c377206e4bc",
        from: person("SOC2 审计员", "auditor@secureframe.com"),
        subject: "回复：请于周五前提交审计材料",
        bodyText: "跟进提醒：审核平台中仍未收到权限审核材料。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T13:10:00.000Z",
      }),
    ]),
    thread("18f51c3bb925a4f7", [
      message({
        id: "18f51c3c6cae1075",
        from: person("GitHub", "notifications@github.com"),
        subject: "请审核 inbox-zero-ai 的合并请求 #4821",
        bodyText: "有一个涉及账单和规则自动化的合并请求邀请您审核。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T09:05:00.000Z",
      }),
    ]),
    thread("18f51c409f36e2ad", [
      message({
        id: "18f51c4160bd8b2a",
        from: person("Vercel", "notifications@vercel.com"),
        subject: "生产环境部署成功",
        bodyText: "inbox-zero-ai 已成功部署到生产环境，提交 4f91e7 已上线。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T10:12:00.000Z",
      }),
    ]),
    thread("18f51c47ab305e91", [
      message({
        id: "18f51c4872d91c0a",
        from: person("Linear", "digest@linear.app"),
        subject: "工作区每周摘要",
        bodyText:
          "本周关闭了 12 个问题，新建了 8 个问题，邮件同时汇总了工作区中的项目进展。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T12:00:00.000Z",
      }),
    ]),
    thread("18f51c4c1a6d0bb2", [
      message({
        id: "18f51c4d8a035a0d",
        from: person("Lenny 产品简报", "newsletter@lennysnewsletter.com"),
        subject: "本周简报：如何提升定价页面的转化率",
        bodyText: "面向产品与增长团队的新文章、赞助信息及近期活动预告。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T14:00:00.000Z",
      }),
    ]),
    thread("18f51c51cb8450a4", [
      message({
        id: "18f51c5222ec01f6",
        from: person("Notion", "updates@mail.notion.so"),
        subject: "Notion 本月功能更新",
        bodyText: "汇总本月产品更新、模板、工作区改进和使用指南。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T18:10:00.000Z",
      }),
    ]),
    thread("18f51c56549273bf", [
      message({
        id: "18f51c571e9a4830",
        from: person("Vercel", "updates@vercel.com"),
        subject: "Vercel 产品更新：新增可观测性功能",
        bodyText: "本月产品发布、可观测性功能与相关指南汇总。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-18T15:20:00.000Z",
      }),
    ]),
    thread("18f51c5bd84ca9e2", [
      message({
        id: "18f51c5c9baf016e",
        from: person("里娜·莱维", "rina@horizonsearch.co"),
        subject: "平台负责人岗位终面安排",
        bodyText: "请确认周四上午十一点是否方便参加终面。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T11:45:00.000Z",
      }),
      message({
        id: "18f51c5f2ab740d3",
        from: person("里娜·莱维", "rina@horizonsearch.co"),
        subject: "回复：平台负责人岗位终面安排",
        bodyText: "如果周四时间较紧，候选人周五下午也可以参加。",
        unread: false,
        labels: ["INBOX"],
        date: "2026-04-22T12:16:00.000Z",
      }),
    ]),
    thread("18f51c63f0a48bc8", [
      message({
        id: "18f51c64c77539a0",
        from: person("Stripe", "receipts@stripe.com"),
        subject: "您的 OpenAI 付款收据",
        bodyText: "这是您月度订阅的付款收据，并非支付失败提醒。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-18T07:30:00.000Z",
      }),
    ]),
    thread("18f51c685b4d107e", [
      message({
        id: "18f51c6972ef2c45",
        from: person("卡尔·帕克", "cal@pipelinepilot.io"),
        subject: "快速提升销售线索的建议",
        bodyText:
          "我们通过 AI 外呼帮助 SaaS 创业者获得更多演示预约，您是否方便抽出十五分钟交流？",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-17T17:02:00.000Z",
      }),
    ]),
    thread("18f51c6d44a90e7b", [
      message({
        id: "18f51c6e1785b221",
        from: person("莉娅·戈德曼", "leah@northstar.vc"),
        subject: "第二季度经营数据跟进",
        bodyText:
          "感谢更新。请在合伙人会议前发送年度经常性收入（ARR）、客户留存率和企业销售管线数据。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T14:42:00.000Z",
      }),
      message({
        id: "18f51c708364f9c1",
        from: person("亚历克斯·摩根", "alex@northstarhq.com"),
        subject: "回复：第二季度经营数据跟进",
        bodyText: "好的，财务完成三月份结账后，我会发送完整数据表。",
        unread: false,
        labels: ["SENT"],
        date: "2026-04-22T15:01:00.000Z",
      }),
    ]),
  ],
};

export const supportOpsHeavyInbox: DemoInboxFixture = {
  id: "supportOpsHeavy",
  name: "客户支持与运营收件箱",
  description:
    "包含客户故障、退款、文档咨询、内部交接及服务商推广邮件的客服负责人收件箱。",
  mailbox: {
    email: "support@luminahq.com",
    displayName: "萨姆·里韦拉",
    timezone: "America/New_York",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51d0a33b82d45", [
      message({
        id: "18f51d0b4c16eae2",
        from: person("泰勒·布鲁克斯", "taylor@brightlane.co"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "重复扣款需要审批退款",
        bodyText: "我们的年度套餐被重复扣款，需要在月底前获得退款审批。",
        unread: true,
        labels: ["INBOX", "待回复", "退款"],
        date: "2026-04-21T13:20:00.000Z",
      }),
    ]),
    thread("18f51d106ba349d0", [
      message({
        id: "18f51d11d90b8f7c",
        from: person("普丽娅·沙阿", "priya@enterpriseops.io"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "一级故障：所有管理员均无法导出",
        bodyText:
          "从今天早上开始，所有管理员的导出操作都失败了，导致合规报告无法完成。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T09:30:00.000Z",
      }),
      message({
        id: "18f51d13ab624ef5",
        from: person("工程问题分诊组", "triage@luminahq.com"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "回复：一级故障：所有管理员均无法导出",
        bodyText: "已确认这是一次回归故障，需要客户提供导出任务编号。",
        unread: false,
        labels: ["INBOX"],
        date: "2026-04-22T10:00:00.000Z",
      }),
    ]),
    thread("18f51d18194b3c62", [
      message({
        id: "18f51d19ea73bf0d",
        from: person("杰米·奥尔蒂斯", "jamie@riseops.co"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "关于 Webhook 重试文档的咨询",
        bodyText:
          "请告知 Webhook 失败后的重试策略。文档页面中的两个数值不一致。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-21T18:15:00.000Z",
      }),
    ]),
    thread("18f51d1d5e8b41a9", [
      message({
        id: "18f51d1e0587bc34",
        from: person("Intercom", "notifications@intercom.io"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "每周客户满意度摘要",
        bodyText: "本周客服收件箱对应的客户满意度为 94%。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T12:00:00.000Z",
      }),
    ]),
    thread("18f51d22cc509f6a", [
      message({
        id: "18f51d2349af651e",
        from: person("凯西·米勒", "casey@supportbench.ai"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "客户支持自动化基准报告",
        bodyText: "我们对客服团队进行基准分析，可以为您介绍如何降低工单量。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T14:30:00.000Z",
      }),
    ]),
    thread("18f51d27f4a3b9c8", [
      message({
        id: "18f51d28c0e75a21",
        from: person("Statuspage", "noreply@statuspage.io"),
        to: [person("萨姆·里韦拉", "support@luminahq.com")],
        subject: "故障已解决：通知延迟",
        bodyText: "导致通知延迟的故障已解决。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T03:10:00.000Z",
      }),
    ]),
  ],
};

export const execCalendarRecruitingInbox: DemoInboxFixture = {
  id: "execCalendarRecruiting",
  name: "管理者日程与招聘收件箱",
  description:
    "包含日程安排、招聘面试、投资人和行政事项、差旅与服务商邮件的管理者收件箱。",
  mailbox: {
    email: "jordan@orbitworks.co",
    displayName: "乔丹·李",
    timezone: "America/Los_Angeles",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51e0a20c94177", [
      message({
        id: "18f51e0b174a6d85",
        from: person("董事会助理", "assistant@northstar.vc"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "董事会筹备会议改至周四",
        bodyText:
          "请确认能否在周四下午两点参加董事会筹备会议。演示材料的审核需要先确定您的时间。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T16:30:00.000Z",
      }),
    ]),
    thread("18f51e10ad9f62cb", [
      message({
        id: "18f51e119c4b07f2",
        from: person("招聘团队", "talent@orbitworks.co"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "销售副总裁候选人面试复盘",
        bodyText: "请在下午四点的复盘会前发送您对销售副总裁候选人的面试意见。",
        unread: true,
        labels: ["INBOX", "待回复", "招聘"],
        date: "2026-04-22T12:20:00.000Z",
      }),
      message({
        id: "18f51e13f760a51d",
        from: person("招聘团队", "talent@orbitworks.co"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "回复：销售副总裁候选人面试复盘",
        bodyText: "这里补充了面试评分表链接和薪酬说明。",
        unread: false,
        labels: ["INBOX", "招聘"],
        date: "2026-04-22T13:05:00.000Z",
      }),
    ]),
    thread("18f51e18bb279fa0", [
      message({
        id: "18f51e19a35c0d6e",
        from: person("TripIt", "alerts@tripit.com"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "航班变更：旧金山至纽约肯尼迪机场",
        bodyText:
          "您从旧金山飞往纽约肯尼迪机场的航班延误了九十分钟，后续转机的风险较高。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T22:40:00.000Z",
      }),
    ]),
    thread("18f51e1d6e8a9243", [
      message({
        id: "18f51e1e42b67c1a",
        from: person("Northstar 运营团队", "ops@northstar.vc"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "请签署更新后的补充协议",
        bodyText: "请于今天签署更新后的补充协议，以便法务完成整套文件。",
        unread: true,
        labels: ["INBOX", "待回复"],
        date: "2026-04-22T08:10:00.000Z",
      }),
    ]),
    thread("18f51e22dc3719b5", [
      message({
        id: "18f51e23a56d8420",
        from: person("增长服务商", "sales@growthvendor.io"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "管理团队日程安排基准报告",
        bodyText:
          "我们帮助管理团队优化日程安排、节省时间，是否可以预约一次简短演示？",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T15:10:00.000Z",
      }),
    ]),
    thread("18f51e278941f0ca", [
      message({
        id: "18f51e287b30d94e",
        from: person("Ramp", "digest@ramp.com"),
        to: [person("乔丹·李", "jordan@orbitworks.co")],
        subject: "每周银行卡交易摘要",
        bodyText: "本周团队发生了 43 笔银行卡交易，目前没有待审批事项。",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T16:00:00.000Z",
      }),
    ]),
  ],
};

function baseLabels() {
  return [
    { id: "INBOX", name: "INBOX", type: "system" as const },
    { id: "UNREAD", name: "UNREAD", type: "system" as const },
    { id: "SENT", name: "SENT", type: "system" as const },
    { id: "Label_To Reply", name: "待回复", type: "user" as const },
    { id: "Label_FYI", name: "供参考", type: "user" as const },
    { id: "Label_Newsletter", name: "订阅邮件", type: "user" as const },
    { id: "Label_Marketing", name: "推广邮件", type: "user" as const },
    { id: "Label_Receipt", name: "收据", type: "user" as const },
    { id: "Label_Notification", name: "通知", type: "user" as const },
    { id: "Label_VIP Customer", name: "重要客户", type: "user" as const },
    { id: "Label_Recruiting", name: "招聘", type: "user" as const },
    {
      id: "Label_Product Updates",
      name: "产品动态",
      type: "user" as const,
    },
    { id: "Label_Security", name: "安全提醒", type: "user" as const },
    { id: "Label_Billing", name: "账单", type: "user" as const },
    { id: "Label_Refunds", name: "退款", type: "user" as const },
  ];
}

function thread(id: string, messages: DemoInboxMessage[]): DemoInboxThread {
  return { id, messages };
}

function message({
  id,
  from,
  to,
  cc,
  subject,
  bodyText,
  bodyHtml,
  date,
  unread,
  labels,
}: Omit<DemoInboxMessage, "to"> & { to?: DemoInboxAddress[] }) {
  return {
    id,
    from,
    to: to ?? [person("亚历克斯·摩根", "alex@northstarhq.com")],
    cc,
    subject,
    bodyText,
    bodyHtml,
    date,
    unread,
    labels,
  };
}

function person(name: string, email: string): DemoInboxAddress {
  return { name, email };
}
