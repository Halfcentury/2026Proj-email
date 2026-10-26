import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupTestRules,
  getRuleState,
  RULE_NAME,
  UPDATED_RULE_NAME,
} from "./automation-test-helpers";
import {
  expectVisibleAfterTransientFetch,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

const SERVER_ACTION_TIMEOUT_MS = 120_000;

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupTestRules(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("creates, edits, toggles, and deletes a manual automation rule", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await cleanupTestRules(emailAccountId);
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation`);
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("heading", { name: "自动化", exact: true }),
  );

  const createDialog = page.getByRole("dialog", { name: "创建规则" });
  const addRuleManually = page.getByRole("button", {
    name: "手动添加规则",
  });
  await expect(async () => {
    if (await addRuleManually.isVisible()) return;
    await page.getByRole("button", { name: "添加规则" }).click();
    await expect(addRuleManually).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 30_000 });
  await addRuleManually.click();
  await expect(createDialog).toBeVisible();

  await createDialog
    .getByPlaceholder("例如：来自已订阅的刊物、博客或服务的定期邮件")
    .fill("来自软件服务商的收据和发票");
  await createDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "归档" }).click();
  await createDialog.getByRole("textbox", { name: "规则名称" }).fill(RULE_NAME);
  const createButton = createDialog.getByRole("button", { name: "创建" });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect
    .poll(() => getRuleState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toMatchObject({
      enabled: true,
      instructions: "来自软件服务商的收据和发票",
      name: RULE_NAME,
      type: "ARCHIVE",
    });
  await page.reload();

  const ruleRow = page.getByRole("row").filter({ hasText: RULE_NAME });
  await expect(ruleRow).toBeVisible({ timeout: 60_000 });

  await ruleRow.getByRole("button", { name: "展开或收起菜单" }).click();
  await page.getByRole("menuitem", { name: "手动编辑" }).click();
  const editDialog = page.getByRole("dialog", { name: "编辑规则" });
  await editDialog
    .getByRole("textbox", { name: "规则名称" })
    .fill(UPDATED_RULE_NAME);
  await editDialog.getByRole("button", { name: "保存" }).click();
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({ name: UPDATED_RULE_NAME });
  await page.reload();

  const updatedRuleRow = page
    .getByRole("row")
    .filter({ hasText: UPDATED_RULE_NAME });
  await expect(updatedRuleRow).toBeVisible({ timeout: 60_000 });
  await updatedRuleRow.getByRole("switch").click();
  await expect(updatedRuleRow.getByRole("switch")).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({
      enabled: false,
      name: UPDATED_RULE_NAME,
    });

  page.once("dialog", (dialog) => dialog.accept());
  await updatedRuleRow.getByRole("button", { name: "展开或收起菜单" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(page.getByText("规则已删除", { exact: true })).toBeVisible();
  await expect(updatedRuleRow).toHaveCount(0);
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toBeUndefined();
});
