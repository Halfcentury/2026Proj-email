import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("analyzes current mail, shows sources, preserves drafts and opens the original composer", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const rows = page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .filter(
      process.env.EMAIL_QA_LLM_URL ? { hasText: /第二季度经营数据跟进/i } : {},
    );
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  await rows.first().click();
  await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
  const panel = page.getByTestId("email-ai-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /^(重新分析|分析邮件)$/ }).click();
  await expect(
    panel.getByRole("button", { name: "重新分析", exact: true }),
  ).toBeEnabled({ timeout: 90_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-analysis");
  await panel.getByRole("button", { name: "查看分析依据" }).click();
  await expect(
    panel.getByRole("heading", { name: "本次分析的依据" }),
  ).toBeVisible();
  await expect(panel.locator("details")).not.toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-sources");
  await panel.getByRole("tab", { name: "回复", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "本次回复要求" })
    .fill("简短回复；不要猜测尚未确认的事实");
  await panel
    .getByRole("button", { name: /^(生成回复草稿|重新生成回复)$/ })
    .click();
  await expect(
    panel.getByRole("button", { name: "在写信窗口编辑", exact: true }),
  ).toBeEnabled({ timeout: 90_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-reply");
  await panel
    .getByRole("textbox", { name: "本次回复要求" })
    .fill("修改后的要求");
  await expect(
    panel.getByRole("button", { name: "在写信窗口编辑" }),
  ).toBeDisabled();
  await panel
    .getByRole("textbox", { name: "本次回复要求" })
    .fill("简短回复；不要猜测尚未确认的事实");
  await panel.getByRole("button", { name: "在写信窗口编辑" }).click();
  await expect(
    page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: "关闭写信窗口" }) }),
  ).toBeVisible({ timeout: 30_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-composer");
});

test("uses calendar/meeting resource cards and responsive mobile panel", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  await expect(
    page
      .getByRole("listbox", { name: "会话" })
      .getByRole("option")
      .filter(
        process.env.EMAIL_QA_LLM_URL
          ? { hasText: /第二季度经营数据跟进/i }
          : {},
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });
  await page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .filter(
      process.env.EMAIL_QA_LLM_URL ? { hasText: /第二季度经营数据跟进/i } : {},
    )
    .first()
    .click();
  await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
  const panel = page.getByTestId("email-ai-panel");
  await panel.getByRole("tab", { name: "操作", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "开始时间", exact: true })
    .fill("2026-11-01T09:00");
  await panel
    .getByRole("textbox", { name: "结束时间", exact: true })
    .fill("2026-11-01T18:00");
  await panel.getByRole("button", { name: "查询这段时间" }).click();
  await expect(
    panel
      .getByText(/尚未连接日历，无法判断是否有空|日历查询|此范围未查到日历事件/)
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  await panel.getByRole("button", { name: "查找相关会议纪要" }).click();
  await expect(panel.getByText("适用的会议资料", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-resources");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog", { name: "AI 助手" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-mobile");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("shows the exact stored knowledge quote and keeps edited AI draft content on reopen", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.EMAIL_QA_LLM_URL,
    "Requires the explicitly configured local scripted QA fixture.",
  );
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const rows = page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .filter(
      process.env.EMAIL_QA_LLM_URL ? { hasText: /第二季度经营数据跟进/i } : {},
    );
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  await rows.first().click();
  await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
  const panel = page.getByTestId("email-ai-panel");
  await panel.getByRole("tab", { name: "回复", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "本次回复要求" })
    .fill("核对数据后回复");
  await panel
    .getByRole("button", { name: /^(生成回复草稿|重新生成回复)$/ })
    .click();
  await expect(
    panel.getByRole("button", { name: "在写信窗口编辑" }),
  ).toBeEnabled({ timeout: 90_000 });
  await expect(panel.getByText("待确认的信息", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-grounded-reply");
  await panel.getByRole("button", { name: "查看参考资料" }).click();
  const knowledge = panel
    .locator("details")
    .filter({ hasText: "测试知识：经营数据核对" });
  await expect(knowledge).toBeVisible();
  await knowledge.locator("summary").click();
  await expect(knowledge).toContainText(
    "对外发送 ARR、留存率和企业销售管线前，必须核对最新统计周期及数据。",
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "email-ai-knowledge-source",
  );
  const href = await knowledge
    .getByRole("link", { name: "打开来源" })
    .getAttribute("href");
  expect(href).toContain("knowledge-id=qa-integration-policy");
  await panel.getByRole("tab", { name: "回复", exact: true }).click();
  await panel.getByRole("button", { name: "在写信窗口编辑" }).click();
  const composer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "关闭写信窗口" }) });
  const editor = composer.getByRole("textbox", { name: "邮件内容" });
  await editor.fill("人工修改：请保留这段草稿内容。");
  await composer.getByRole("button", { name: "关闭写信窗口" }).click();
  await panel.getByRole("button", { name: "在写信窗口编辑" }).click();
  await expect(editor).toContainText("人工修改：请保留这段草稿内容。");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "email-ai-user-draft-preserved",
  );
  await composer.getByRole("button", { name: "关闭写信窗口" }).click();
  await page.goto(href!);
  await expect(page.getByRole("dialog", { name: "编辑知识" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page
      .getByRole("dialog", { name: "编辑知识" })
      .getByRole("textbox", { name: "标题" }),
  ).toHaveValue("测试知识：经营数据核对");
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-source-location");
});

test("the conversational assistant calls the same complete RAG service and renders its sources", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.EMAIL_QA_LLM_URL,
    "Requires the explicitly configured local scripted QA fixture.",
  );
  const base = process.env.EMAIL_QA_LLM_URL!.replace(/\/v1\/?$/, "");
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const row = page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .filter(
      process.env.EMAIL_QA_LLM_URL ? { hasText: /第二季度经营数据跟进/i } : {},
    )
    .first();
  await expect(row).toBeVisible({ timeout: 90_000 });
  await row.click();
  await expect(page).toHaveURL(/thread-id=/);
  const threadId = new URL(page.url()).searchParams.get("thread-id")!;
  const marker = `回复联调_${Date.now()}`;
  const previous = await (
    await page.request.get(`${base}/__emulator/requests`)
  ).json();
  await page.request.post(`${base}/__emulator/replies`, {
    data: {
      match: "先核对数据，不要编造数字",
      object: {
        reply:
          "关于 ARR、留存率和企业销售管线：[请填入已核对的数据及统计周期]。",
        confidence: "HIGH",
        missingInformation: ["最新经营数据及统计周期"],
      },
    },
  });
  await page.request.post(`${base}/__emulator/replies`, {
    data: {
      match: marker,
      toolCall: {
        name: "generateReply",
        arguments: { threadId, instructions: "先核对数据，不要编造数字" },
      },
    },
  });
  await page.goto(`/${id}/assistant`);
  const input = page.getByTestId("chat-input");
  await expect(input).toBeVisible({ timeout: 60_000 });
  await input.fill(
    `${marker} 请参考知识库为这封邮件生成回复，并列出待确认信息。`,
  );
  await input.press("Enter");
  await expect
    .poll(
      async () => {
        const requests = await (
          await page.request.get(`${base}/__emulator/requests`)
        ).json();
        return requests
          .slice(previous.length)
          .some((request: { messages: { content: string }[] }) =>
            request.messages.some((message) =>
              message.content.includes("You write email replies as the user"),
            ),
          );
      },
      { timeout: 90_000, intervals: [100, 250, 500] },
    )
    .toBe(true);
  await page.request.post(`${base}/__emulator/replies`, {
    data: {
      match: marker,
      text: "已根据实际资料准备回复，发送前请确认经营数据及统计周期。",
    },
  });
  await expect(
    page.getByText("已根据实际资料准备回复，发送前请确认经营数据及统计周期。", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText("回复草稿", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("最新经营数据及统计周期", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByText(/资料来源（\d+）/)
    .first()
    .click();
  await expect(
    page.getByText("测试知识：经营数据核对", { exact: true }).first(),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "email-ai-assistant-rag");
  await page.getByRole("button", { name: "在写信窗口编辑" }).first().click();
  await expect(
    page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: "关闭写信窗口" }) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭写信窗口" }).click();
  await page.goto(`/${id}/mail?thread-id=${encodeURIComponent(threadId)}`);
  await expect(
    page.getByRole("button", { name: "打开邮件 AI 助手" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
  const syncedPanel = page.getByTestId("email-ai-panel");
  await syncedPanel.getByRole("tab", { name: "回复", exact: true }).click();
  await expect(
    syncedPanel.getByRole("textbox", { name: "本次回复要求" }),
  ).toHaveValue("先核对数据，不要编造数字", { timeout: 30_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "email-chat-result-synced");
});

test("preserves feedback edits across tabs and saves explicit long-term preferences", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const row = page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .first();
  await expect(row).toBeVisible({ timeout: 90_000 });
  await row.click();
  await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
  const panel = page.getByTestId("email-ai-panel");
  await panel.getByRole("tab", { name: "操作", exact: true }).click();
  await panel.getByText("反馈与以后如何处理", { exact: true }).click();
  const style = panel.getByRole("textbox", { name: "以后使用的写作偏好" });
  await expect(
    panel.getByRole("button", { name: "确认保存", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  const original = await style.inputValue();
  try {
    await style.fill("QA：语言简洁，业务数据先核对。");
    await panel.getByRole("tab", { name: "分析", exact: true }).click();
    await panel.getByRole("tab", { name: "操作", exact: true }).click();
    await panel.getByText("反馈与以后如何处理", { exact: true }).click();
    await expect(style).toHaveValue("QA：语言简洁，业务数据先核对。");
    await panel.getByRole("button", { name: "确认保存", exact: true }).click();
    await expect(
      panel.getByText("已保存，以后的回复会参考这些写作偏好。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "确认保存", exact: true }),
    ).toBeEnabled();
    await expect(style).toHaveValue("QA：语言简洁，业务数据先核对。");
    await capturePlaywrightCheckpoint(page, testInfo, "email-feedback-saved");
    await page.reload();
    await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
    await panel.getByRole("tab", { name: "操作", exact: true }).click();
    await panel.getByText("反馈与以后如何处理", { exact: true }).click();
    await expect(style).toHaveValue("QA：语言简洁，业务数据先核对。");
  } finally {
    await style.fill(original);
    await panel.getByRole("button", { name: "确认保存", exact: true }).click();
  }
});

test("reads an incoming CSV and uses its actual bytes in shared reply evidence", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.EMAIL_QA_LLM_URL ||
      !process.env.GOOGLE_BASE_URL?.includes("localhost"),
    "Uses only the isolated local provider fixture.",
  );
  const { Client } = await import("pg");
  const { decryptToken } = await import("@/utils/encryption");
  const { id } = await getEmailAccount(page);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let createdId = "";
  try {
    const token = (
      await db.query(
        'SELECT a.access_token FROM "Account" a JOIN "EmailAccount" ea ON ea."accountId"=a.id WHERE ea.id=$1',
        [id],
      )
    ).rows[0].access_token;
    const headers = { Authorization: `Bearer ${decryptToken(token)}` };
    const raw = [
      "From: 测试供应商 <qa-supplier@example.com>",
      "To: developer@example.com",
      "Subject: 附件报价验收",
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="qa-attachment"',
      "",
      "--qa-attachment",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "请根据附件中的报价单准备回复。",
      "--qa-attachment",
      'Content-Type: text/csv; name="报价.csv"',
      'Content-Disposition: attachment; filename="报价.csv"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("产品,价格\nA,120").toString("base64"),
      "--qa-attachment--",
      "",
    ].join("\r\n");
    const inserted = await page.request.post(
      `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/messages`,
      {
        headers,
        data: {
          raw: Buffer.from(raw).toString("base64url"),
          labelIds: ["INBOX", "UNREAD"],
        },
      },
    );
    expect(inserted.status()).toBe(200);
    const message = await inserted.json();
    createdId = message.id;
    await page.goto(
      `/${id}/mail?thread-id=${encodeURIComponent(message.threadId)}`,
    );
    await expect(
      page.getByRole("button", { name: "打开邮件 AI 助手" }),
    ).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
    const panel = page.getByTestId("email-ai-panel");
    await panel.getByRole("tab", { name: "操作", exact: true }).click();
    await panel.getByRole("button", { name: "读取正文", exact: true }).click();
    await expect(
      panel.getByText("产品,价格\nA,120", { exact: true }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-incoming-attachment-read",
    );
    const base = process.env.EMAIL_QA_LLM_URL!.replace(/\/v1\/?$/, "");
    await page.request.post(`${base}/__emulator/replies`, {
      data: {
        match: "请核对附件报价并确认适用币种",
        object: {
          reply: "附件报价单中 A 产品的价格为 120。[发送前请确认适用币种。]",
          confidence: "HIGH",
          missingInformation: ["适用币种"],
        },
      },
    });
    await panel.getByRole("tab", { name: "回复", exact: true }).click();
    await panel
      .getByRole("textbox", { name: "本次回复要求" })
      .fill("请核对附件报价并确认适用币种");
    await panel
      .getByRole("button", { name: "生成回复草稿", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "在写信窗口编辑", exact: true }),
    ).toBeEnabled({ timeout: 90_000 });
    await panel
      .getByRole("button", { name: "查看参考资料", exact: true })
      .click();
    await panel.locator("summary").filter({ hasText: "报价.csv" }).click();
    await expect(
      panel.getByText("产品,价格\nA,120", { exact: true }),
    ).toBeVisible();
    const requests = await (
      await page.request.get(`${base}/__emulator/requests`)
    ).json();
    expect(
      requests.some((request: { messages: { content: string }[] }) =>
        request.messages.some((m) => m.content.includes("产品,价格\nA,120")),
      ),
    ).toBe(true);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-incoming-attachment-source",
    );
    await page.request.delete(
      `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/messages/${createdId}`,
      { headers },
    );
  } finally {
    await db.end();
  }
});
