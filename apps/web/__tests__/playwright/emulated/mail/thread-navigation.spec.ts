import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { expectThreadReaderBody, openMail } from "./mail-test-helpers";

test("expands unread messages when opening a thread", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_unread_expand`,
    {
      waitUntil: "domcontentloaded",
    },
  );

  const headers = page.locator(
    'li[data-thread-message-id] [role="button"][aria-expanded]',
  );
  await expect(headers).toHaveCount(4);
  await expect(headers.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(headers.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(headers.nth(2)).toHaveAttribute("aria-expanded", "true");
  await expect(headers.nth(3)).toHaveAttribute("aria-expanded", "true");
  await capturePlaywrightCheckpoint(page, testInfo, "unread-messages-expanded");
});

test("keeps arrow navigation inside the thread and expands from its toolbar", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_reader_collapse`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await expectThreadReaderBody(page, "最新的已读邮件保持展开。");
  const threadUrl = page.url();
  const messages = page.locator("li[data-thread-message-id]");
  const selected = page.locator('li[aria-current="true"]');
  await expect(messages).toHaveCount(2);
  await expect(selected).toHaveCount(1);
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "navigation-selected-message",
  );
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  const toolbar = page.getByRole("group", { name: "会话操作" });
  const expand = toolbar.getByRole("button", {
    name: "展开全部邮件",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "展开全部邮件", exact: true }),
  ).toHaveCount(1);
  await expand.click();
  await expectThreadReaderBody(page, "第一封已折叠的历史邮件。");
  await toolbar
    .getByRole("button", { name: "收起全部邮件", exact: true })
    .click();
  await expect(
    messages.first().locator('[role="button"][aria-expanded]'),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "navigation-mobile-toolbar",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await messages.last().focus();
  await page.keyboard.press("Enter");

  const editor = page.getByRole("textbox", { name: "邮件内容" });
  await expect(editor).toBeFocused();
  await expect(editor.locator(":scope > div")).toHaveText("");
  await page.getByLabel(/^Show (signature and )?quoted message$/).click();
  await expect(
    page.getByRole("toolbar", { name: "选中文字格式" }),
  ).toBeHidden();
  await page.getByLabel(/^Hide (signature and )?quoted message$/).click();
  await expect(
    page.getByRole("toolbar", { name: "选中文字格式" }),
  ).toBeHidden();
  await editor.fill(
    "A reply on the first line.\nAnother line for cursor navigation.",
  );
  await page.keyboard.press("ArrowUp");
  await expect(editor).toBeFocused();
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
});

test("navigates messages from inside a rich email body", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_reader_html`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  const emailBody = page
    .frameLocator('iframe[title="Email content preview"]')
    .last()
    .getByText("这是一封用于验证键盘导航的富文本邮件。");
  await expect(emailBody).toBeVisible({ timeout: 60_000 });
  const threadUrl = page.url();
  const messages = page.locator("li[data-thread-message-id]");
  await emailBody.click();
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await emailBody.click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "邮件内容" })).toBeVisible();
});

test("expands a collapsed message before Enter opens a reply", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_reader_collapse`,
    {
      waitUntil: "domcontentloaded",
    },
  );

  const message = page.locator("li[data-thread-message-id]").first();
  const header = message.locator('[role="button"][aria-expanded]');
  const editor = message.getByRole("textbox", { name: "邮件内容" });
  await expect(header).toHaveAttribute("aria-expanded", "false");

  await message.focus();
  await page.keyboard.press("Enter");

  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(message.locator(".animate-spin")).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "collapsed-message-expanded-with-enter",
  );

  await message.focus();
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await expect(page.getByRole("textbox", { name: "邮件内容" })).toHaveCount(1);
});
