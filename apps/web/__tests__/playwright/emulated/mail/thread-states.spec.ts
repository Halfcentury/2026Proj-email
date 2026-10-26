import { expect, type Page } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  clearWorkflowMailboxDrafts,
  expectThreadReaderBody,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

test.beforeEach(async ({ page }) => {
  await clearWorkflowMailboxDrafts(page);
});

test("captures queued reply and reconnect", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "回复流程测试邮件" }),
  ).toBeVisible();
  const initialResponse = await page.request.get(
    "/api/threads/thr_playwright_reply?includeDrafts=true",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(initialResponse.ok()).toBe(true);
  const initialThread: ThreadResponse = await initialResponse.json();
  const initialSentIds = initialThread.thread.messages
    .filter((message) => message.labelIds?.includes("SENT"))
    .map((message) => message.id);
  const replyBody = `Confirmed, see you Thursday. This reply is sent only inside the local emulator. Attempt ${testInfo.retry}.`;
  const editor = page.locator("[contenteditable='true']");
  if (!(await editor.count())) await replyToSeededWorkflowMessage(page).click();
  await expect(editor).toBeVisible();
  await editor.fill(replyBody);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  const queuedToast = page.locator("[data-sonner-toast]").filter({
    hasText: "Email queued. It will send when you're back online.",
  });
  const delivery = page.getByRole("region", {
    name: "回复投递状态",
  });
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toBeVisible();
  await expect(queuedToast).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "09-queued-reply");
  await expect(queuedToast).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "10-queued-after-toast");
  await page
    .evaluate(async () => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => true,
      });
      await window.__inboxZeroMailInspect?.requestSync?.();
      window.dispatchEvent(new Event("online"));
    })
    .catch((error) => {
      if (!String(error).includes("Execution context was destroyed"))
        throw error;
    });
  await expect(
    page.getByRole("heading", { name: /回复流程测试邮件/ }),
  ).toBeVisible({ timeout: 60_000 });
  await page
    .evaluate(async () => {
      await window.__inboxZeroMailInspect?.requestSync?.();
    })
    .catch((error) => {
      if (!String(error).includes("Execution context was destroyed"))
        throw error;
    });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/threads/thr_playwright_reply?includeDrafts=true",
          { headers: { "X-Email-Account-ID": emailAccountId } },
        );
        if (!response.ok()) return false;
        const body: ThreadResponse = await response.json();
        const appended = body.thread.messages.filter(
          (message) =>
            message.labelIds?.includes("SENT") &&
            !initialSentIds.includes(message.id),
        );
        return appended.some((message) =>
          `${message.textPlain ?? ""}${message.textHtml ?? ""}`.includes(
            replyBody,
          ),
        );
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  await expectThreadReaderBody(page, replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "11-sent-reply");
});

test("restores a queued reply for editing without sending a duplicate", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "回复流程测试邮件" }),
  ).toBeVisible();
  const editor = await openSeededWorkflowReplyEditor(page);
  const text = "I can review the updated proposal on Thursday.";
  await editor.fill(text);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  const delivery = page.getByRole("region", { name: "回复投递状态" });
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toBeVisible();
  await delivery.getByRole("button", { name: "编辑回复" }).click();
  const restored = page
    .locator('[data-thread-message-id="msg_playwright_reply"]')
    .locator("[contenteditable='true']");
  await expect(restored).toContainText(text);
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toBeUndefined();
  await restored.fill(`${text} Let's meet at 3 pm.`);
  await expect(restored).toContainText("Let's meet at 3 pm.");
  await capturePlaywrightCheckpoint(page, testInfo, "22-edit-queued-reply");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "回复流程测试邮件" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toBeUndefined();
});

test("captures thread reading and reply states", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
  await expectThreadReaderBody(
    page,
    "第二封邮件用于验证完整会话能够正常显示。",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "01-collapsed-history");
  const collapsed = page
    .locator('[role="button"][aria-expanded="false"]')
    .filter({ hasText: "达娜" });
  if (await collapsed.count()) await collapsed.click();
  await expectThreadReaderBody(page, "这是阅读器会话中的第一封邮件。");
  await capturePlaywrightCheckpoint(page, testInfo, "02-expanded-history");
  await page
    .getByRole("button", { name: "显示详情", exact: true })
    .last()
    .click();
  await expect(page.getByText("发件人", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "03-header-details");
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const replyMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  const collapsedReply = replyMessage.locator(
    '[role="button"][aria-expanded="false"]',
  );
  await expect(replyMessage).toBeVisible();
  if (await collapsedReply.count()) await collapsedReply.click();
  await expect(
    replyMessage.getByText("请回复这封预置测试邮件。"),
  ).toBeVisible();
  const toolbar = page.getByRole("group", { name: "会话操作" });
  await expect(
    toolbar.getByRole("button", { name: "回复", exact: true }),
  ).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /删除/ })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "04-single-message");
  await toolbar.getByRole("button", { name: /更多操作/ }).click();
  await expect(page.getByRole("menuitem", { name: /删除/ })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "25-thread-actions-menu");
  await page.keyboard.press("Escape");
  await replyMessage.getByRole("button", { name: "回复", exact: true }).click();
  const editor = page.locator("[contenteditable='true']");
  await expect(editor).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "05-empty-reply");
  await editor.pressSequentially(
    "Thanks Leslie, Thursday at 2 pm works for me. I will bring the updated proposal.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "06-populated-reply");
  await page.getByRole("button", { name: /^Draft to Leslie/ }).click();
  await expect(
    page.getByRole("combobox", { name: "抄送", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "07-reply-recipients");
  await page.getByRole("button", { name: "隐藏收件人", exact: true }).click();
  await expect(editor).toContainText(
    "Thanks Leslie, Thursday at 2 pm works for me.",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "回复流程测试邮件" }),
  ).toBeVisible();
  // The saved reply reopens on its own after a reload.
  await expect(editor).toHaveCount(1);
  await expect(editor).toContainText(
    "Thanks Leslie, Thursday at 2 pm works for me.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "08-draft-after-reload");
  await editor.fill("A reply that should survive navigation.");
  await expect(editor).toContainText("A reply that should survive navigation.");
  await page.goto(`/${emailAccountId}/mail`);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "回复流程测试邮件" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "12-draft-after-navigation",
  );
  await expect(editor).toHaveCount(1);
  await editor.fill("Mobile reply: the proposed time works well.");
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(page, testInfo, "13-mobile-reply");
});

test("captures a longer thread and draft collapse", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
  await expectThreadReaderBody(
    page,
    "第二封邮件用于验证完整会话能够正常显示。",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "14-long-thread");
  await page.getByRole("button", { name: "回复", exact: true }).last().click();
  const editor = page.locator("[contenteditable='true']");
  await editor.fill("This reply should survive collapsing its parent message.");
  const header = page
    .locator("li[data-thread-message-id]")
    .last()
    .locator('[role="button"][aria-expanded]')
    .first();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await header.click();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(
    "This reply should survive collapsing its parent message.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "15-draft-after-collapse");
});

function replyToSeededWorkflowMessage(page: Page) {
  return page
    .locator('[data-thread-message-id="msg_playwright_reply"]')
    .getByRole("button", { name: "回复", exact: true });
}

async function openSeededWorkflowReplyEditor(page: Page) {
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  const collapsed = message.locator('[role="button"][aria-expanded="false"]');
  if (await collapsed.count()) await collapsed.click();
  const editor = page.getByRole("textbox", { name: "邮件内容" });
  if (!(await editor.count()) || !(await editor.first().isVisible())) {
    await replyToSeededWorkflowMessage(page).click();
  }
  await expect(editor).toBeVisible();
  return editor;
}
