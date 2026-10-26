import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("composes and sends mail through the retained provider workflow", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  await expect(
    page.getByRole("listbox", { name: "会话" }).getByRole("option").first(),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByRole("combobox", { name: "To" }).press("Enter");
  await dialog.getByPlaceholder("主题").fill(`精简后发送验收 ${Date.now()}`);
  await dialog.locator('[contenteditable="true"]').fill("个人邮箱发送验收。");
  await capturePlaywrightCheckpoint(page, testInfo, "personal-composer");
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("邮件已发送！", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /发送失败/ })).toHaveCount(0);
  // Allow the normal undo interval to finish before leaving the page.
  await page.waitForTimeout(12_000);
  await capturePlaywrightCheckpoint(page, testInfo, "personal-sent");
});

for (const [route, title] of [
  ["calendars", "日历"],
  ["meetings", "会议"],
  ["drive", "自动整理附件"],
  ["briefs", "会前简报"],
  ["automation", "自动化"],
]) {
  test(`loads retained ${route} page without retired controls`, async ({
    page,
  }, testInfo) => {
    const { id } = await getEmailAccount(page);
    await page.goto(`/${id}/${route}`);
    await expect(
      page
        .getByRole("heading", {
          name: route === "meetings" ? /^(会议|自动记录会议笔记)$/ : title,
          exact: true,
        })
        .first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByText("Application error", { exact: false }),
    ).toHaveCount(0);
    for (const removed of [
      "premium",
      "organization",
      "channels",
      "integrations",
    ]) {
      await expect(page.locator(`a[href$="/${removed}"]`)).toHaveCount(0);
    }
    await capturePlaywrightCheckpoint(page, testInfo, `personal-${route}`);
  });
}
