import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  getPersistedOnboardingState,
  openControlOnboarding,
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

test.beforeEach(async () => {
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await resetOnboardingTestState();
});

test("completes account setup and persists onboarding choices", async ({
  page,
}, testInfo) => {
  await openControlOnboarding(page);

  await page.getByRole("button", { name: "创业者", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "公司有多少人？" }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "11–100 人", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How did you hear about 十组邮件小助手?",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "希望如何整理收件箱？",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "是否自动起草回复？",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "启用", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "自定义规则", exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "邀请团队", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "跳过", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Labels are ready", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "继续", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome-upgrade(?:\?.*)?$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "开始 7 天免费试用" }),
  ).toBeVisible();

  // A fresh upgrade-page load must resolve the signed-in user without app providers.
  const userResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/user/me" && response.ok(),
  );
  await page.reload();
  expect((await (await userResponse).json()).id).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "免费试用 7 天", exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("welcome-upgrade.png"),
    fullPage: true,
  });

  await expect
    .poll(getPersistedOnboardingState, { timeout: 30_000 })
    .toMatchObject({
      completed: true,
      draftRepliesEnabled: true,
      role: "Founder",
      surveyCompanySize: 50,
      surveyRole: "Founder",
      surveySource: "github",
    });
  expect(
    (await getPersistedOnboardingState())?.systemRuleCount,
  ).toBeGreaterThan(0);
});
