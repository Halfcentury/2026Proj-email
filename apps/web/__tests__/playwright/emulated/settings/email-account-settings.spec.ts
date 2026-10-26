import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  cleanUpSettingsFixture,
  getEmailAccountSettingsCard,
  getSettingsDatabaseState,
  openSettings,
  prepareSettingsFixture,
  type SettingsFixture,
} from "./settings-test-helpers";

let fixture: SettingsFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareSettingsFixture(page);
});

test.afterEach(async () => {
  if (fixture) await cleanUpSettingsFixture(fixture);
});

test("persists draft cleanup settings and disables all account rules", async ({
  page,
}) => {
  if (!fixture) throw new Error("The Settings fixture was not prepared");
  const settingsFixture = fixture;
  await openSettings(page);

  let accountCard = getEmailAccountSettingsCard(page, settingsFixture.email);
  await expect(accountCard.toggle).toBeVisible({ timeout: 60_000 });
  await accountCard.toggle.click();

  await expect(
    accountCard.card.getByText("阅读状态", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    accountCard.card.getByRole("switch", { name: "启用或关闭阅读状态" }),
  ).toBeChecked();

  let cleanupDaysInput = accountCard.card.getByRole("spinbutton", {
    name: "草稿保留天数",
  });
  await expect(cleanupDaysInput).toHaveValue("7", { timeout: 60_000 });
  await cleanupDaysInput.fill("21");
  await cleanupDaysInput
    .locator('xpath=ancestor::*[@data-slot="item-actions"]')
    .getByRole("button", { name: "保存" })
    .click();
  await expect(
    page.getByText("草稿清理设置已更新。", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  const disableRulesItem = accountCard.card
    .locator('[data-slot="item"]')
    .filter({ hasText: "Disable All Rules" });
  await expect(disableRulesItem).toBeVisible({ timeout: 60_000 });
  await disableRulesItem.getByRole("button", { name: "全部禁用" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "禁用全部规则？",
  });
  await confirmation.getByRole("button", { name: "全部禁用" }).click();
  await expect(page.getByText("全部规则已禁用", { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  await expect
    .poll(() => getSettingsDatabaseState(settingsFixture))
    .toEqual({
      draftCleanupDays: 21,
      followUpAwaitingReplyDays: null,
      followUpNeedsReplyDays: null,
      ruleEnabled: false,
    });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  accountCard = getEmailAccountSettingsCard(page, settingsFixture.email);
  await expect(accountCard.toggle).toBeVisible({ timeout: 60_000 });
  await accountCard.toggle.click();
  cleanupDaysInput = accountCard.card.getByRole("spinbutton", {
    name: "草稿保留天数",
  });
  await expect(cleanupDaysInput).toHaveValue("21", { timeout: 60_000 });
  await expect(accountCard.card.getByText("禁用全部规则")).toHaveCount(0);
});
