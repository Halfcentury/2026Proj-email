import { expect, type Locator, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  expectThreadReaderBody,
  openMail,
} from "./mail-test-helpers";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

test("refreshes date groups after midnight when the tab resumes", async ({
  page,
}, testInfo) => {
  // The emulator dates its newest messages 24 hours before setup.
  const mailboxDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await page.clock.install({ time: mailboxDay });
  const { conversations } = await openMail(page);
  const today = conversations.getByRole("group", {
    name: "今天",
    exact: true,
  });
  await expect(today).toBeVisible();
  await expect(today.getByText("今天", { exact: true })).toHaveCount(0);
  const todaySubjects = await today
    .locator("[data-mail-thread-subject]")
    .allTextContents();
  expect(todaySubjects.length).toBeGreaterThan(0);

  const afterMidnight = await page.evaluate(() => {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 1, 0, 0);
    return nextDay.getTime();
  });
  // Moving the clock without running timers simulates a suspended tab.
  await page.clock.setSystemTime(afterMidnight);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  const yesterday = conversations.getByRole("group", {
    name: "昨天",
    exact: true,
  });
  for (const subject of todaySubjects) {
    await expect(yesterday.getByText(subject, { exact: true })).toBeVisible();
    await expect(today.getByText(subject, { exact: true })).toHaveCount(0);
  }
  await expect(yesterday.getByText("昨天", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-date-rollover");
});

test("switches between list and split reading layouts", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const emptyReader = page.getByText("未选择邮件", { exact: true });
  await expect(emptyReader).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-list-layout");

  await page.getByRole("button", { name: "切换列表或分栏视图" }).click();
  await expect(emptyReader).toBeVisible();
  await expect(conversations).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-split-layout");

  await conversationWithSubject(
    page,
    conversations,
    "项目标签测试邮件",
  ).click();
  await expect(
    page.getByRole("heading", { name: "项目标签测试邮件" }),
  ).toBeVisible();
  await expectThreadReaderBody(page, "此会话可在预置的项目标签中查看。");
  await expect(conversations).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-selected-conversation-layout",
  );

  await expect(page.getByRole("button", { name: /Focus mode/i })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "切换列表或分栏视图" }).click();
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});

test("expands and shortens the conversation preview text", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  // Only the wide list puts the snippet beside the subject, so the split
  // preference has to be off for the two preview branches to differ.
  await expect(page.getByText("未选择邮件", { exact: true })).toBeHidden();

  const toggle = page.getByRole("button", {
    name: "展开或缩短预览文字",
  });
  // Both preferences outlive a test, so start from short rather than assume it.
  if ((await toggle.getAttribute("aria-pressed")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }
  await expectStoredPreview(page, emailAccountId, false);

  const row = conversations.getByRole("option").first();
  const shortHeight = await rowHeight(row);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => await rowHeight(row))
    .toBeGreaterThan(shortHeight);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-expanded-preview");

  // The preference is stored per account, so a reload has to keep it on.
  await expectStoredPreview(page, emailAccountId, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => await rowHeight(row)).toBe(shortHeight);
  await expectStoredPreview(page, emailAccountId, false);
});

/**
 * Waits on the stored preference rather than the action's response, so a
 * concurrent server action can't settle the wait early and let a reload abort
 * the write that is still in flight.
 */
async function expectStoredPreview(
  page: Page,
  emailAccountId: string,
  expected: boolean,
) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/mail/settings", {
        headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
      });
      const settings = (await response.json()) as MailSettingsResponse;
      return settings.expandedPreview;
    })
    .toBe(expected);
}

async function rowHeight(row: Locator) {
  const box = await row.boundingBox();
  return box?.height ?? 0;
}
