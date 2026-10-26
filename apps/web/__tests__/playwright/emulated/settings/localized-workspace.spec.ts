import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("shows localized demo mail, searches Chinese text and names automation consistently", async ({
  page,
}, testInfo) => {
  const { id } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  const rows = page.getByRole("listbox", { name: "会话" }).getByRole("option");
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  await expect(
    rows.filter({ hasText: /第二季度经营数据跟进/ }).first(),
  ).toBeVisible();
  await expect(
    rows.filter({ hasText: /Follow-up on|Approval needed|Weekly workspace/ }),
  ).toHaveCount(0);
  const labels = page.getByRole("button", { name: "标签", exact: true });
  if ((await labels.getAttribute("aria-expanded")) === "false")
    await labels.click();
  await expect(page.getByRole("link", { name: /^重要客户/ })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "localized-inbox");
  const search = page.getByPlaceholder("搜索邮件");
  await search.fill("经营数据");
  await search.press("Enter");
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(rows.first()).toContainText("经营数据");
  await rows.first().click();
  await expect(
    page.getByRole("heading", { name: /第二季度经营数据跟进/ }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "localized-mail-reader");
  await page.goto(`/${id}/automation`);
  await expect(
    page.getByRole("heading", { name: "自动化", exact: true }),
  ).toBeVisible();
  const tools = page.getByRole("button", { name: "工具", exact: true });
  if (
    (await tools.isVisible()) &&
    (await tools.getAttribute("aria-expanded")) === "false"
  )
    await tools.click();
  await expect(
    page.getByRole("link", { name: "自动化", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "对话", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("智能助手", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "renamed-automation");
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "AI 对话与自动化" }),
  ).toBeVisible();
  await expect(page.getByText(/Slack|Telegram|Teams/)).toHaveCount(0);
});
