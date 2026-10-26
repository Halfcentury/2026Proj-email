import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  expectThreadReaderBody,
  readProviderAccessToken,
  UNDO_WINDOW_SEND_TIMEOUT_MS,
} from "../mail/mail-test-helpers";

test("reads Chinese Outlook demo mail and delivers a Chinese composed message", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const rows = page.getByRole("listbox", { name: "会话" }).getByRole("option");
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  await expect(
    rows.filter({ hasText: /Outlook 测试邮件/ }).first(),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "localized-outlook-inbox");
  const search = page.getByPlaceholder("搜索邮件");
  await search.fill("请审批第二季度经营数据");
  await search.press("Enter");
  await expect(rows.first()).toContainText("请审批第二季度经营数据", {
    timeout: 90_000,
  });
  await rows.first().click();
  await expectThreadReaderBody(page, "用于验证邮件服务接口的模拟测试邮件。");
  await capturePlaywrightCheckpoint(page, testInfo, "localized-outlook-reader");

  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  const recipient = dialog.getByRole("combobox", { name: "To" });
  await recipient.fill("recipient@example.com");
  await recipient.press("Enter");
  const subject = `Outlook 中文发送验收 ${Date.now()}`;
  const body = "这是一封中文发送验收邮件，用于核对邮件主题和正文。";
  await dialog.getByPlaceholder("主题").fill(subject);
  await dialog.locator('[contenteditable="true"]').fill(body);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "localized-outlook-composer",
  );
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("邮件已发送！", { exact: true })).toBeVisible();

  const token = await readProviderAccessToken();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `${process.env.MICROSOFT_BASE_URL}/v1.0/me/mailFolders/sentitems/messages?$top=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok()) return false;
        const result = (await response.json()) as {
          value?: Array<{ subject?: string; body?: { content?: string } }>;
        };
        return result.value?.some(
          (message) =>
            message.subject === subject &&
            message.body?.content?.includes(body),
        );
      },
      { timeout: UNDO_WINDOW_SEND_TIMEOUT_MS },
    )
    .toBe(true);
  await capturePlaywrightCheckpoint(page, testInfo, "localized-outlook-sent");
});
