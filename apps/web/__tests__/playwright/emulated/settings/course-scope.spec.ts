import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("keeps core mail workflows and trims navigation, settings and mobile menus", async ({
  page,
}, testInfo) => {
  const { id, email } = await getEmailAccount(page);
  await page.goto(`/${id}/mail`);
  await expect(page.getByRole("listbox", { name: "会话" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByRole("listbox", { name: "会话" }).getByRole("option").first(),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "course-mail");
  await page
    .getByRole("listbox", { name: "会话" })
    .getByRole("option")
    .first()
    .click();
  await expect(page.getByRole("group", { name: "会话操作" })).toBeVisible({
    timeout: 60_000,
  });
  await capturePlaywrightCheckpoint(page, testInfo, "course-reader");

  await page.goto(`/${id}/automation`);
  const tools = page.getByRole("button", { name: "工具", exact: true });
  await expect(tools).toBeVisible({ timeout: 60_000 });
  if ((await tools.getAttribute("aria-expanded")) === "false")
    await tools.click();
  for (const name of ["收件箱", "对话", "自动化", "日历", "会议", "附件"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  for (const path of [
    "channels",
    "stats",
    "organization",
    "premium",
    "integrations",
  ]) {
    await expect(page.locator(`a[href$="/${path}"]`)).toHaveCount(0);
  }
  await capturePlaywrightCheckpoint(page, testInfo, "course-navigation");

  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "邮箱账户", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator('[role="button"]').filter({ hasText: email }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".content-container .animate-spin")).toHaveCount(
    0,
    { timeout: 60_000 },
  );
  await expect(page.locator('a[href$="/usage"]')).toHaveCount(0);
  const appearance = page.getByRole("switch", { name: "切换深色模式" });
  await appearance.check();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await appearance.uncheck();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  for (const name of ["账单", "团队"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(
      0,
    );
  }
  await expect(page.getByText("连接应用", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "course-settings");

  await page.goto(`/${id}/automation`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "展开或收起侧栏", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "收件箱", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "course-mobile-navigation");
});

test("blocks old commercial pages and direct API writes", async ({ page }) => {
  const { id } = await getEmailAccount(page);
  for (const path of [
    "/premium",
    `/${id}/channels`,
    `/${id}/stats`,
    `/${id}/organization/create`,
  ]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(
      new URL(response.headers().location, "http://localhost").pathname,
    ).toBe("/mail");
  }
  for (const path of [
    "/api/stripe/webhook",
    "/api/slack/events",
    "/api/telegram/events",
    "/api/teams/events",
    "/api/organizations/test",
  ]) {
    const response = await page.request.post(path, { data: {} });
    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "此功能不在当前项目范围内",
    });
  }
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "邮箱账户", exact: true }),
  ).toBeVisible();
});
