import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  type AutomationSettingsCleanup,
  cleanupAutomationSettings,
  expectVisibleAfterTransientFetch,
  getAutomationSettingsCard,
  getAutomationSettingsState,
  getKnowledgeState,
  KNOWLEDGE_TITLE,
  markAutomationOnboardingViewed,
  seedAutomationSettings,
  UPDATED_KNOWLEDGE_TITLE,
} from "./automation-tabs-test-helpers";

const SERVER_ACTION_TIMEOUT_MS = 120_000;

let settingsCleanup: AutomationSettingsCleanup | undefined;

test.afterEach(async () => {
  if (settingsCleanup) await cleanupAutomationSettings(settingsCleanup);
  settingsCleanup = undefined;
});

test("enables drafting and manages persisted draft knowledge", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  settingsCleanup = {
    ...(await seedAutomationSettings(emailAccountId)),
    emailAccountId,
  };
  await markAutomationOnboardingViewed(page);

  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get("/api/knowledge", {
            headers: { "X-Email-Account-ID": emailAccountId },
          });
          return response.ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  const autoDraftItem = getAutomationSettingsCard(page, "自动起草回复");
  const autoDraftSwitch = autoDraftItem.getByRole("switch");
  await expectVisibleAfterTransientFetch(page, autoDraftSwitch);
  await expect(autoDraftSwitch).not.toBeChecked();
  await autoDraftSwitch.click();
  await expect
    .poll(
      async () => {
        const state = await getAutomationSettingsState(emailAccountId);
        return state.draftActionTypes;
      },
      { timeout: SERVER_ACTION_TIMEOUT_MS },
    )
    .toContain("DRAFT_EMAIL");

  await page.reload();
  await expectVisibleAfterTransientFetch(page, autoDraftSwitch);
  await expect(autoDraftSwitch).toBeChecked();

  const knowledgeItem = getAutomationSettingsCard(page, "回复知识库");
  const manageKnowledge = knowledgeItem.getByRole("button", { name: "管理" });
  await expectVisibleAfterTransientFetch(page, manageKnowledge);
  await expect(manageKnowledge).toBeEnabled({ timeout: 60_000 });
  await manageKnowledge.click();

  const knowledgeDialog = page.getByRole("dialog", {
    name: "回复知识库",
  });
  await expect(
    knowledgeDialog.getByRole("button", { name: "添加", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await knowledgeDialog.getByRole("button", { name: "添加" }).click();

  const addDialog = page.getByRole("dialog", { name: "添加知识" });
  await addDialog.getByRole("textbox", { name: "标题" }).fill(KNOWLEDGE_TITLE);
  await addDialog
    .locator('[contenteditable="true"]')
    .fill("客户每天早上使用产品清理收件箱。");
  await addDialog.getByRole("button", { name: "创建" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toEqual({
      content: "客户每天早上使用产品清理收件箱。",
      title: KNOWLEDGE_TITLE,
    });

  const knowledgeRow = knowledgeDialog
    .getByRole("row")
    .filter({ hasText: KNOWLEDGE_TITLE });
  await expect(knowledgeRow).toBeVisible({ timeout: 60_000 });
  await knowledgeRow.getByRole("button", { name: "编辑" }).click();

  const editDialog = page.getByRole("dialog", { name: "编辑知识" });
  await editDialog
    .getByRole("textbox", { name: "标题" })
    .fill(UPDATED_KNOWLEDGE_TITLE);
  await editDialog
    .locator('[contenteditable="true"]')
    .fill("客户每天早上使用产品筛选重要邮件。");
  await editDialog.getByRole("button", { name: "更新" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toEqual({
      content: "客户每天早上使用产品筛选重要邮件。",
      title: UPDATED_KNOWLEDGE_TITLE,
    });

  const updatedRow = knowledgeDialog
    .getByRole("row")
    .filter({ hasText: UPDATED_KNOWLEDGE_TITLE });
  await expect(updatedRow).toBeVisible({ timeout: 60_000 });
  await updatedRow.getByRole("button").last().click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "删除知识库条目",
  });
  await deleteDialog.getByRole("button", { name: "删除" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toBeUndefined();
  await expect(updatedRow).toHaveCount(0);
});
