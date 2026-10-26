import { Client } from "pg";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { decryptToken } from "@/utils/encryption";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("restores the actual confirmed recording-setting result after reopening chat", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.EMAIL_QA_LLM_URL ||
      !process.env.GOOGLE_BASE_URL?.includes("localhost"),
    "Local provider and scripted model fixture only.",
  );
  const { id } = await getEmailAccount(page);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const previous = (
    await db.query(
      'SELECT "meetingRecorderEnabled" FROM "EmailAccount" WHERE id=$1',
      [id],
    )
  ).rows[0].meetingRecorderEnabled;
  try {
    await page.goto(`/${id}/mail`);
    const row = page
      .getByRole("listbox", { name: "会话" })
      .getByRole("option")
      .filter({ hasText: /第二季度经营数据跟进/ })
      .first();
    await expect(row).toBeVisible({ timeout: 90_000 });
    await row.click();
    const threadId = new URL(page.url()).searchParams.get("thread-id")!;
    const token = (
      await db.query(
        'SELECT a.access_token FROM "Account" a JOIN "EmailAccount" ea ON ea."accountId"=a.id WHERE ea.id=$1',
        [id],
      )
    ).rows[0].access_token;
    const response = await page.request.get(
      `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
      { headers: { Authorization: `Bearer ${decryptToken(token)}` } },
    );
    const messages = (await response.json()).messages;
    const messageId = messages
      .filter((m: { labelIds?: string[] }) => !m.labelIds?.includes("DRAFT"))
      .at(-1).id;
    const marker = `会议记录确认联调_${Date.now()}`;
    const base = process.env.EMAIL_QA_LLM_URL!.replace(/\/v1\/?$/, "");
    await page.request.post(`${base}/__emulator/replies`, {
      data: {
        match: marker,
        toolCall: {
          name: "configureMeetingRecording",
          arguments: { threadId, messageId, enabled: false },
        },
      },
    });
    await page.request.post(`${base}/__emulator/replies`, {
      data: { match: "currentEnabled", text: "已准备设置方案，请确认后执行。" },
    });
    await page.goto(`/${id}/assistant`);
    const input = page.getByTestId("chat-input");
    await expect(input).toBeVisible();
    await input.fill(`${marker} 请关闭当前邮箱的会议记录，先展示确认方案。`);
    await input.press("Enter");
    const confirm = page
      .getByRole("button", { name: "确认修改", exact: true })
      .first();
    await expect(confirm).toBeVisible({ timeout: 90_000 });
    await page.request.post(`${base}/__emulator/replies`, {
      data: { match: marker, text: "已准备设置方案，请确认后执行。" },
    });
    await expect(confirm).toBeEnabled({ timeout: 60_000 });
    await confirm.click();
    await expect(
      page.getByRole("button", { name: "已完成", exact: true }).first(),
    ).toBeDisabled({ timeout: 60_000 });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "已完成", exact: true }).first(),
    ).toBeDisabled({ timeout: 60_000 });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-confirmation-restored",
    );
    await page.goto(`/${id}/mail?thread-id=${encodeURIComponent(threadId)}`);
    await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
    const panel = page.getByTestId("email-ai-panel");
    await panel.getByRole("tab", { name: "操作", exact: true }).click();
    await expect(
      panel.getByRole("heading", { name: "执行记录", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText("停用邮箱会议记录", { exact: true }).first(),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-operation-record-synced",
    );
  } finally {
    await db.query(
      'UPDATE "EmailAccount" SET "meetingRecorderEnabled"=$1 WHERE id=$2',
      [previous, id],
    );
    await db.end();
  }
});

test("opens an exact reply-memory record and rejects an unrelated record", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      'INSERT INTO "ReplyMemory" (id,"createdAt","updatedAt",content,kind,"scopeType","scopeValue","emailAccountId") VALUES ($1,NOW(),NOW(),$2,\'PROCEDURE\',\'SENDER\',$3,$4) ON CONFLICT (id) DO NOTHING',
      [
        "qa-exact-memory",
        "交付承诺必须先核对订单状态。",
        "qa-supplier@example.com",
        id,
      ],
    );
    await page.goto(`/${id}/mail/source/reply-memory/qa-exact-memory`);
    await expect(
      page.getByText("交付承诺必须先核对订单状态。", { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(/发件人 · qa-supplier@example.com/),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-exact-memory-source",
    );
    await page.goto(`/${id}/mail/source/reply-memory/missing-owned-record`);
    await expect(
      page.getByRole("alert").filter({ hasText: "未找到此邮箱的回复经验。" }),
    ).toBeVisible();
  } finally {
    await db.query(
      'DELETE FROM "ReplyMemory" WHERE id=$1 AND "emailAccountId"=$2',
      ["qa-exact-memory", id],
    );
    await db.end();
  }
});
