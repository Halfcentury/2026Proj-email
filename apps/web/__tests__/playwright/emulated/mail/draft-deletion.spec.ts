import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("updates the draft indicator after deletion and retains remaining drafts", async ({
  page,
}, testInfo) => {
  // Keep background sync from repairing a stale list during this assertion.
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { conversations } = await openMail(page);
  if (!(await page.getByText("未选择邮件", { exact: true }).isVisible())) {
    await page.getByRole("button", { name: "切换列表或分栏视图" }).click();
  }
  const row = conversationWithSubject(page, conversations, "草稿删除示例");
  await expect(row.getByText("草稿", { exact: true })).toBeVisible();
  await row.click();
  const discardButtons = page.getByRole("button", {
    name: "丢弃草稿",
    exact: true,
  });
  await expect(discardButtons).toHaveCount(2);
  const discard = discardButtons.first();
  await expect(discard).toBeVisible({ timeout: 60_000 });
  await page.route("**/mail**", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await discard.click();
  await expect(page.getByText("丢弃草稿失败", { exact: true })).toBeVisible();
  await expect(discard).toBeVisible();
  await expect(row.getByText("草稿", { exact: true })).toBeVisible();
  await page.unroute("**/mail**");
  await discard.click();
  await expect(discardButtons).toHaveCount(1);
  await expect(row.getByText("草稿", { exact: true })).toBeVisible();
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(discardButtons).toHaveCount(0);
  await expect(row.getByText("草稿", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "deleted-draft-indicator");
});
