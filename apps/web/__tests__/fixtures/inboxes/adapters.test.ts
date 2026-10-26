import { describe, expect, test } from "vitest";
import { saasFounderMixedInbox } from "@/__tests__/fixtures/inboxes/demo-inboxes";
import {
  buildRuleFixtureRow,
  searchFixtureMessages,
  toGmailSeedMessages,
  toMockMessages,
  toRuleRows,
} from "@/__tests__/fixtures/inboxes/adapters";
import { ActionType } from "@/generated/prisma/enums";

describe("demo inbox fixture adapters", () => {
  test("converts every fixture message into Gmail seed data", () => {
    const seedMessages = toGmailSeedMessages(saasFounderMixedInbox);
    const fixtureMessageCount = saasFounderMixedInbox.threads.reduce(
      (count, thread) => count + thread.messages.length,
      0,
    );

    expect(seedMessages).toHaveLength(fixtureMessageCount);
    expect(seedMessages).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9]{16}$/),
        user_email: saasFounderMixedInbox.mailbox.email,
        from: "AWS 安全中心 <no-reply-aws@amazon.com>",
        subject: "生产账户的根用户多重身份验证已停用",
        label_ids: expect.arrayContaining(["INBOX", "UNREAD"]),
      }),
    );
  });

  test("converts fixture messages into ParsedMessage-like test messages", () => {
    const messages = toMockMessages(saasFounderMixedInbox);
    const customerMessage = messages.find(
      (message) => message.subject === "需升级处理：续约条款尚未确定",
    );

    expect(customerMessage).toEqual(
      expect.objectContaining({
        threadId: expect.stringMatching(/^[a-f0-9]{16}$/),
        subject: "需升级处理：续约条款尚未确定",
        textPlain: expect.stringContaining("采购部门将暂停续约"),
        labelIds: expect.arrayContaining(["INBOX", "UNREAD"]),
      }),
    );
  });

  test("searches fixture messages by common Gmail-style query terms", () => {
    const productUpdates = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "in:inbox 产品更新",
      maxResults: 10,
    });
    const unreadSecurity = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "is:unread 安全",
      maxResults: 10,
    });

    expect(productUpdates.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        "Notion 本月功能更新",
        "Vercel 产品更新：新增可观测性功能",
      ]),
    );
    expect(unreadSecurity.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        "生产账户的根用户多重身份验证已停用",
        "检测到新的可疑登录",
      ]),
    );
  });

  test("preserves internal hyphens while dropping negative search terms", () => {
    const followUp = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "经营数据",
      maxResults: 10,
    });
    const deployment = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "inbox-zero-ai -security",
      maxResults: 10,
    });

    expect(followUp.messages.map((message) => message.subject)).toContain(
      "第二季度经营数据跟进",
    );
    expect(deployment.messages.map((message) => message.subject)).toContain(
      "生产环境部署成功",
    );
  });

  test("builds default system rules alongside eval-provided rules", () => {
    const rules = toRuleRows({
      rules: [
        {
          name: "VIP Customers",
          instructions:
            "Emails from active enterprise customers that need same-day attention.",
          actions: [{ type: ActionType.LABEL, label: "VIP Customer" }],
        },
      ],
    });

    expect(rules.map((rule) => rule.name)).toEqual(
      expect.arrayContaining(["待回复", "订阅邮件", "VIP Customers"]),
    );
    expect(
      buildRuleFixtureRow({
        name: "Security",
        instructions: "Security alerts.",
        actions: [{ type: ActionType.LABEL, label: "Security" }],
      }).actions,
    ).toEqual([
      expect.objectContaining({ type: ActionType.LABEL, label: "Security" }),
    ]);
  });
});
