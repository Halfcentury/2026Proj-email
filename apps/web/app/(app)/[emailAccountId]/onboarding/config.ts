import {
  RocketIcon,
  BriefcaseIcon,
  StoreIcon,
  CodeIcon,
  CalendarDaysIcon,
  TrendingUpIcon,
  PhoneIcon,
  MegaphoneIcon,
  HeadphonesIcon,
  HomeIcon,
  VideoIcon,
  UsersIcon,
  ShoppingCartIcon,
  GraduationCapIcon,
  UserIcon,
  CircleHelpIcon,
  type LucideIcon,
} from "lucide-react";

export const usersRolesInfo: Record<
  string,
  {
    icon: LucideIcon;
    suggestedLabels: { label: string; description: string }[];
  }
> = {
  Founder: {
    icon: RocketIcon,
    suggestedLabels: [
      {
        label: "客户反馈",
        description: "来自客户的反馈和建议",
      },
      {
        label: "投资者",
        description: "来自投资者和风投机构的邮件",
      },
      {
        label: "紧急",
        description: "需要立即处理的时效性邮件",
      },
    ],
  },
  Executive: {
    icon: BriefcaseIcon,
    suggestedLabels: [
      {
        label: "董事会",
        description: "董事会会议、资料和董事往来邮件",
      },
      {
        label: "重要联系人",
        description: "重要合作伙伴、客户及贵宾往来邮件",
      },
    ],
  },
  "Small Business Owner": {
    icon: StoreIcon,
    suggestedLabels: [
      {
        label: "客户反馈",
        description: "来自客户的反馈和建议",
      },
      {
        label: "紧急",
        description: "需要立即处理的时效性邮件",
      },
    ],
  },
  "Software Engineer": {
    icon: CodeIcon,
    suggestedLabels: [
      {
        label: "告警",
        description: "服务器错误和部署通知",
      },
      {
        label: "GitHub",
        description: "合并请求和代码审查",
      },
      {
        label: "缺陷",
        description: "缺陷报告和问题跟踪",
      },
      {
        label: "安全",
        description: "安全漏洞和更新",
      },
    ],
  },
  Assistant: {
    icon: CalendarDaysIcon,
    suggestedLabels: [
      {
        label: "安排会议",
        description: "需要安排会议的邮件",
      },
      {
        label: "出行",
        description: "出行安排和行程",
      },
    ],
  },
  Investor: {
    icon: TrendingUpIcon,
    suggestedLabels: [
      {
        label: "公司动态",
        description: "被投公司进展报告",
      },
      {
        label: "项目推介",
        description: "创业项目介绍和投资机会",
      },
      {
        label: "LP",
        description: "有限合伙人往来邮件",
      },
      {
        label: "尽职调查",
        description: "投资研究与分析",
      },
    ],
  },
  Sales: {
    icon: PhoneIcon,
    suggestedLabels: [
      {
        label: "潜在客户",
        description: "潜在客户和销售线索",
      },
      {
        label: "客户",
        description: "现有客户往来邮件",
      },
      {
        label: "交易洽谈",
        description: "正在进行的谈判和提案",
      },
      {
        label: "流失风险",
        description: "可能取消服务的客户",
      },
    ],
  },
  Marketing: {
    icon: MegaphoneIcon,
    suggestedLabels: [
      {
        label: "营销活动",
        description: "营销和推广活动",
      },
      {
        label: "内容审核",
        description: "需要审批或反馈的内容草稿",
      },
      {
        label: "分析报告",
        description: "绩效指标和营销分析",
      },
      {
        label: "合作伙伴 / 代理机构",
        description: "营销机构和合作伙伴往来邮件",
      },
    ],
  },
  "Customer Support": {
    icon: HeadphonesIcon,
    suggestedLabels: [
      {
        label: "支持工单",
        description: "客户对产品或服务的求助",
      },
      {
        label: "缺陷",
        description: "客户提交的缺陷报告",
      },
      {
        label: "功能建议",
        description: "客户提出的新功能建议",
      },
    ],
  },
  Realtor: {
    icon: HomeIcon,
    suggestedLabels: [
      {
        label: "买方线索",
        description: "咨询房产的潜在买家",
      },
      {
        label: "卖方线索",
        description: "计划出售房产的业主",
      },
      {
        label: "看房预约",
        description: "看房请求",
      },
      {
        label: "房产交割",
        description: "房产交割文档和往来邮件",
      },
    ],
  },
  "Content Creator": {
    icon: VideoIcon,
    suggestedLabels: [
      {
        label: "赞助",
        description: "品牌赞助咨询和合作",
      },
      {
        label: "协作",
        description: "其他创作者的合作请求",
      },
      {
        label: "品牌合作",
        description: "品牌合作机会",
      },
      {
        label: "媒体",
        description: "媒体咨询和采访请求",
      },
    ],
  },
  Consultant: {
    icon: UsersIcon,
    suggestedLabels: [
      {
        label: "客户项目",
        description: "客户项目和进展",
      },
      {
        label: "提案",
        description: "业务提案和招标回复",
      },
      {
        label: "专业人脉",
        description: "行业联系和推荐机会",
      },
    ],
  },
  "E-commerce": { icon: ShoppingCartIcon, suggestedLabels: [] },
  Student: {
    icon: GraduationCapIcon,
    suggestedLabels: [
      {
        label: "学校",
        description: "教师和教职员工邮件",
      },
      {
        label: "作业",
        description: "作业和项目截止时间",
      },
      {
        label: "实习",
        description: "实习机会和申请",
      },
      {
        label: "学习资料",
        description: "课堂笔记和学习资源",
      },
    ],
  },
  Individual: { icon: UserIcon, suggestedLabels: [] },
  Other: { icon: CircleHelpIcon, suggestedLabels: [] },
};
