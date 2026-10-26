import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  conversationWithSubject,
  expectSeamlessReplyHandoff,
  clearWorkflowMailboxDrafts,
  expectThreadReaderBody,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
  UNDO_WINDOW_SEND_TIMEOUT_MS,
  waitForComposeOutboxSend,
  watchReplyHandoff,
  withClient,
} from "./mail-test-helpers";

test.beforeEach(async ({ page }) => {
  await clearWorkflowMailboxDrafts(page);
});

test("composes, sends, and reads a new message from Sent", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Playwright Composed Message ${testInfo.retry}`;

  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "收件人" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("主题").fill(subject);
  const composeEditor = dialog.locator("[contenteditable='true']");
  await composeEditor.pressSequentially("A composed message body.");
  await expect(composeEditor).toContainText("A composed message body.");
  await dialog.getByRole("button", { name: "Show signature" }).click();
  await expect(
    composeEditor
      .locator("[data-smartmail]")
      .getByRole("link", { name: "十组邮件小助手" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "composer-with-footer");
  await dialog.getByRole("button", { exact: true, name: "发送" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("邮件已发送！", { exact: true })).toBeVisible();

  await openMailboxFromSidebar(page, "Sent");
  await waitForComposeOutboxSend(page, emailAccountId);
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await expect(sentConversation).toBeVisible({ timeout: 60_000 });
  await sentConversation.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(page.getByText("recipient@example.com").first()).toBeVisible();
  await expectThreadReaderBody(page, "A composed message body.");
  await expectThreadReaderBody(page, "Sent with 十组邮件小助手");
  await capturePlaywrightCheckpoint(page, testInfo, "composed-message-in-sent");
});

test("undoes a composed message before it is delivered", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Playwright Undo Send ${Date.now()}`;

  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "收件人" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("主题").fill(subject);
  await dialog
    .locator("[contenteditable='true']")
    .pressSequentially("This should not be delivered.");
  await dialog.getByRole("button", { exact: true, name: "发送" }).click();

  await expect(dialog).toBeHidden();
  const notifications = page.getByRole("region", {
    name: "Notifications alt+T",
  });
  await expect(
    notifications.getByText("邮件已发送！", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "compose:new-message",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  await notifications.getByRole("button", { name: /撤销/ }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("主题")).toHaveValue(subject);
  await expect(dialog.getByRole("textbox", { name: "邮件内容" })).toContainText(
    "This should not be delivered.",
  );
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "compose:new-message",
      }),
    )
    .toBeUndefined();
  await capturePlaywrightCheckpoint(page, testInfo, "compose-undo-restored");

  await openMailboxFromSidebar(page, "Sent");
  await expect(
    conversationWithSubject(page, conversations, subject),
  ).toHaveCount(0);
});

test("selects the sender when composing from all accounts", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  const signature = "Secondary account signature";
  const secondAccount = await createSecondEmailAccount(emailAccountId, {
    signature,
  });

  try {
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await page.getByRole("button", { name: /写邮件/ }).click();

    const dialog = page.getByRole("dialog", { name: "新邮件" });
    const from = dialog.getByRole("combobox", { name: "发件人" });
    await expect(from).toBeVisible();
    await from.click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page
      .getByRole("option", {
        name: `${secondAccount.name} (${secondAccount.email})`,
        exact: true,
      })
      .click();

    await expect(from).toContainText(secondAccount.email);
    await dialog.getByRole("button", { name: "Show signature" }).click();
    await expect(
      dialog
        .getByRole("textbox", { name: "邮件内容" })
        .locator("[data-smartmail]")
        .getByText(signature),
    ).toBeVisible();
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("leaves the draft before returning to the list with Escape", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "回复流程测试邮件",
  ).click();
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await message.getByRole("button", { name: "回复", exact: true }).click();
  const editor = message.getByRole("textbox", { name: "邮件内容" });
  await editor.fill("A draft preserved when leaving the input.");
  // The reply tooltip owns Escape until its exit animation finishes.
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const threadUrl = page.url();

  await editor.press("Escape");
  await expect(message).toBeFocused();
  await expect(page).toHaveURL(threadUrl);
  await expect(editor).toContainText(
    "A draft preserved when leaving the input.",
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "draft-escape-focuses-message",
  );

  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
  await expect(message).toBeHidden();
});

test("focuses the To field when forwarding with F", async ({ page }) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "回复流程测试邮件",
  ).click();
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible();
  await expect(
    message.getByRole("button", { name: "转发", exact: true }),
  ).toBeVisible();

  // Restored drafts focus their editor; this shortcut belongs to the reader.
  await message.press("KeyF");

  const toField = message.getByRole("combobox", { name: "收件人" });
  await expect(toField).toBeVisible();
  await expect(toField).toBeFocused();
  await expect(
    message.getByRole("textbox", { name: "邮件内容" }),
  ).not.toBeFocused();
});

test("opens and sends a reply from the reader with Enter", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const replyConversation = conversationWithSubject(
    page,
    conversations,
    "回复流程测试邮件",
  );
  await replyConversation.click();
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");

  await expectThreadReaderBody(page, "请回复这封预置测试邮件。");
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();

  const replyEditor = page.locator("[contenteditable='true']");
  await expect(replyEditor).toBeVisible();
  await expect(replyEditor).toHaveCount(1);
  await expect(
    page.locator("[data-email-preserved-kind='quote']"),
  ).toBeAttached();
  await expect(
    page.getByLabel(/^Show (signature and )?quoted message$/),
  ).toBeVisible();
  await expect(page.getByText("Quoted message", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Remove quoted message" }),
  ).toHaveCount(0);
  const replyBody = `A reply sent through the mail reader. ${testInfo.retry}`;
  await replyEditor.pressSequentially(replyBody);
  await expect(replyEditor).toContainText(replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "inline-reply-divider");
  const sendButton = page.getByRole("button", { name: "发送", exact: true });
  await expect(sendButton).toHaveText("发送");

  await replyEditor.press("ControlOrMeta+Shift+l");
  await expect(page.getByRole("dialog", { name: "定时发送" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "send-later-shortcut");

  await page.getByRole("button", { name: "选择日期和时间" }).click();
  await page
    .getByLabel("Send later date and time")
    .press("ControlOrMeta+Shift+h");
  await expect(page.getByRole("dialog", { name: "提醒我" })).toBeVisible();
  await page.keyboard.press("Escape");

  await replyEditor.press("ControlOrMeta+Shift+l");
  await expect(page.getByRole("dialog", { name: "定时发送" })).toBeVisible();
  await expect(page.getByLabel("Send later date and time")).toBeHidden();
  await page.keyboard.press("Escape");

  await sendButton.hover();
  const sendTooltip = page.getByRole("tooltip", { name: /Send and mark done/ });
  await expect(sendTooltip).toContainText("Send and mark done");
  await expect(sendTooltip.locator("kbd")).toHaveText([
    "⌘",
    "enter",
    "⌘",
    "shift",
    "enter",
  ]);
  await capturePlaywrightCheckpoint(page, testInfo, "protected-quoted-reply");
  await sendButton.click();

  const notifications = page.getByRole("region", {
    name: "Notifications alt+T",
  });
  await expect(
    notifications.getByText("邮件已发送！", { exact: true }),
  ).toBeVisible();
  await expect(
    notifications.getByRole("button", { name: /撤销/ }),
  ).toBeVisible();
  await expect(replyEditor).toHaveCount(0);
  await expectThreadReaderBody(page, replyBody);
  const delivery = page.getByRole("region", { name: "回复投递状态" });
  await expect(delivery.getByText("正在发送…", { exact: true })).toHaveCount(0);
  await expect(delivery.getByText("回复已发送", { exact: true })).toHaveCount(
    0,
  );
  await expect(delivery.getByRole("button", { name: "编辑回复" })).toHaveCount(
    0,
  );
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: UNDO_WINDOW_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-sent-in-thread");
});

test("pops a reply out of the thread into its own window", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  // An earlier test replies in this thread, so open it directly.
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 60_000 });
  await message.getByRole("button", { name: "回复", exact: true }).click();

  const inlineEditor = page.locator(
    "[data-thread-message-id] [contenteditable='true']",
  );
  await expect(inlineEditor).toHaveCount(1);
  const replyBody = `A reply written before popping out. ${testInfo.retry}`;
  await inlineEditor.pressSequentially(replyBody);
  await expect(inlineEditor).toContainText(replyBody);
  await expect(
    page.getByRole("button", { name: "在独立窗口打开草稿" }),
  ).toBeVisible();

  await inlineEditor.press("ControlOrMeta+Shift+p");

  const dialog = page.getByRole("dialog", { name: /回复流程测试邮件/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[contenteditable='true']")).toContainText(
    replyBody,
  );
  await expect(inlineEditor).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "popped-out-reply");

  await dialog.getByRole("button", { name: "丢弃草稿" }).click();
  await expect(dialog).toBeHidden();
  await expect(inlineEditor).toHaveCount(0);
});

test("moves a sent reply from its composer into the thread without a gap", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await sourceMessage
    .getByRole("button", { name: "回复", exact: true })
    .click();
  const editor = sourceMessage.getByRole("textbox", { name: "邮件内容" });
  const replyBody = `A reply that moves straight into the thread. ${testInfo.retry}`;
  await editor.pressSequentially(replyBody);
  await expect(editor).toContainText(replyBody);

  const handoff = await watchReplyHandoff(page, replyBody);
  await sourceMessage
    .getByRole("button", { name: "发送", exact: true })
    .click();

  // The undo window is still open, so the provider has not sent it yet, but
  // the reply already reads as sent, takes the selection, and leaves the
  // message it answered open. Undo lives only in the toast.
  const sentRow = page.locator(
    'li[data-thread-message-id][data-selected="true"]',
  );
  await expect(sentRow).toBeVisible();
  await expect(sentRow).not.toHaveAttribute(
    "data-thread-message-id",
    "msg_playwright_reply",
  );
  await expect(sourceMessage).toHaveAttribute("data-selected", "false");
  await expect(
    sourceMessage.locator("[aria-expanded]").first(),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(sentRow.locator("time")).toBeVisible();
  await expect(sentRow.getByText("正在发送…")).toHaveCount(0);
  await expect(
    page.locator("li[data-thread-message-id]").getByRole("button", {
      name: /撤销/,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Notifications alt+T" })
      .getByRole("button", { name: /撤销/ }),
  ).toBeVisible();
  await expectThreadReaderBody(page, replyBody, 3000);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-sent-with-undo");

  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: UNDO_WINDOW_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(
    page
      .getByRole("region", { name: "Notifications alt+T" })
      .getByRole("button", { name: /撤销/ }),
  ).toHaveCount(0);
  await expectThreadReaderBody(page, replyBody);
  expectSeamlessReplyHandoff(await handoff.stop(), handoff.rowsBefore);
});

test("undoes a sent reply and restores its text", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await sourceMessage
    .getByRole("button", { name: "回复", exact: true })
    .click();
  const editor = sourceMessage.getByRole("textbox", { name: "邮件内容" });
  const replyBody = `A reply taken back from the thread. ${testInfo.retry}`;
  await editor.pressSequentially(replyBody);
  await sourceMessage
    .getByRole("button", { name: "发送", exact: true })
    .click();

  const undo = page
    .getByRole("region", { name: "Notifications alt+T" })
    .getByRole("button", { name: /撤销/ });
  await expect(undo).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  await undo.click();

  const restored = sourceMessage.getByRole("textbox", {
    name: "邮件内容",
  });
  await expect(restored).toContainText(replyBody);
  await expect(undo).toHaveCount(0);
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toBeUndefined();
  await capturePlaywrightCheckpoint(page, testInfo, "reply-undone-from-thread");
});

test("undoes a sent reply with a file and lists the file again", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await sourceMessage
    .getByRole("button", { name: "回复", exact: true })
    .click();
  await sourceMessage
    .getByRole("textbox", { name: "邮件内容" })
    .pressSequentially(`A reply with notes, taken back. ${testInfo.retry}`);
  await sourceMessage.getByTestId("compose-attachments-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Example notes"),
  });
  const attachments = sourceMessage.getByRole("list", { name: "附件" });
  await expect(attachments.locator("li[aria-busy]")).toHaveCount(0, {
    timeout: 90_000,
  });
  await expect(attachments).toContainText("notes.txt");
  await sourceMessage
    .getByRole("button", { name: "发送", exact: true })
    .click();

  const undo = page
    .getByRole("region", { name: "Notifications alt+T" })
    .getByRole("button", { name: /撤销/ });
  await expect(undo).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  await undo.click();

  // The file stayed on the mailbox draft, so the restored reply lists it.
  await expect(sourceMessage.getByRole("list", { name: "附件" })).toContainText(
    "notes.txt",
    { timeout: 30_000 },
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "reply-with-file-undone-from-thread",
  );
  await sourceMessage.getByRole("button", { name: "丢弃草稿" }).click();
  await expect(
    sourceMessage.getByRole("textbox", { name: "邮件内容" }),
  ).toHaveCount(0);
});

test("sends a reply after its tab closes during the undo window", async ({
  page,
  request,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await sourceMessage
    .getByRole("button", { name: "回复", exact: true })
    .click();
  const replyBody = `A reply that outlives its tab. ${testInfo.retry}`;
  await sourceMessage
    .getByRole("textbox", { name: "邮件内容" })
    .pressSequentially(replyBody);
  await sourceMessage
    .getByRole("button", { name: "发送", exact: true })
    .click();
  await expect
    .poll(() => readHeldReply(emailAccountId, replyBody), { timeout: 20_000 })
    .toMatchObject({ status: "PENDING" });

  // Leaving the page stops this browser's mail engine, so only the server
  // can still deliver the reply.
  await page.goto("about:blank");
  const held = await readHeldReply(emailAccountId, replyBody);
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!held || !internalApiKey) {
    throw new Error("Expected a held reply and an internal API key");
  }
  await withClient((client) =>
    client.query(
      `UPDATE "ScheduledEmail" SET "sendAt" = now() - interval '1 second' WHERE id = $1`,
      [held.id],
    ),
  );
  const delivered = await request.post("/api/scheduled-emails/execute", {
    data: { scheduledEmailId: held.id },
    headers: { "x-api-key": internalApiKey },
  });

  expect(delivered.ok()).toBe(true);
  await expect
    .poll(() =>
      withClient(async (client) => {
        const result = await client.query<{ status: string }>(
          `SELECT status FROM "ScheduledEmail" WHERE id = $1`,
          [held.id],
        );
        return result.rows[0]?.status;
      }),
    )
    .toBe("SENT");
});

test("focuses the To field when forwarding", async ({ page }) => {
  const { emailAccountId } = await openMail(page);
  // Open by thread id so this still works after an earlier reply-and-mark-done
  // removes the conversation from the inbox list.
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 60_000 });

  await message.getByRole("button", { name: "转发", exact: true }).click();
  const toField = message.getByRole("combobox", { name: "收件人" });
  await expect(toField).toBeVisible();
  await expect(toField).toBeFocused();
  await expect(
    message.getByRole("textbox", { name: "邮件内容" }),
  ).not.toBeFocused();
});

test("keeps a sent forward in the thread it came from", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  const recipient = `forward-${testInfo.retry}@example.com`;
  await sourceMessage
    .getByRole("button", { name: "转发", exact: true })
    .click();
  await sourceMessage.getByRole("combobox", { name: "收件人" }).fill(recipient);
  const editor = sourceMessage.getByRole("textbox", {
    name: "邮件内容",
  });
  const forwardBody = `A forwarded message sent through the mail reader. ${testInfo.retry}`;
  await editor.pressSequentially(forwardBody);
  await sourceMessage
    .getByRole("button", { name: "发送", exact: true })
    .click();

  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: UNDO_WINDOW_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(page).toHaveURL(/thread-id=thr_playwright_reply/);
  await expect(sourceMessage).toBeVisible();
  // Messages sent earlier in this shared thread can still be settling when the
  // test starts, so find this forward by its unique recipient rather than a
  // count. The body renders in an iframe, so the header is what's matchable.
  await expect(
    page
      .locator("[data-thread-message-id]")
      .filter({ hasText: `to ${recipient}` }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "回复投递状态" })
      .getByText("回复已发送", { exact: true }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "forward-sent-in-thread");
});

test("shows the files a forward carries", async ({ page }, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "回复：阅读器视觉测试邮件",
  ).click();
  const sourceMessage = page
    .locator("[data-thread-message-id]")
    .filter({ hasText: "邮件图片.png" })
    .last();
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });

  await sourceMessage
    .getByRole("button", { name: "转发", exact: true })
    .click();

  // The provider holds the bytes until the send, so the composer lists them
  // without ever downloading them.
  await expect(
    page.getByRole("list", { name: "附件" }).getByText("邮件图片.png"),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "forward-attachments");
});

test("keeps reply and forward drafts in separate composer sessions", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible();

  await message.getByRole("button", { name: "回复", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "邮件内容" });
  await editor.fill("Reply-only draft text");

  await message.getByRole("button", { name: "转发", exact: true }).click();
  await expect(editor).not.toContainText("Reply-only draft text");
  await expect(message.getByRole("combobox", { name: "收件人" })).toHaveValue(
    "",
  );
  await expect(message.getByRole("button", { name: /^Remove / })).toHaveCount(
    0,
  );
  await editor.fill("Forward-only draft text");

  await message.getByRole("button", { name: "回复", exact: true }).click();
  await expect(editor).toContainText("Reply-only draft text");
  await page.getByRole("button", { name: /^Draft to Leslie/ }).click();
  await expect(
    message.getByRole("button", { name: /^Remove .*leslie@example\.com/i }),
  ).toBeVisible();

  await message.getByRole("button", { name: "转发", exact: true }).click();
  await expect(editor).toContainText("Forward-only draft text");
  await expect(message.getByRole("combobox", { name: "收件人" })).toHaveValue(
    "",
  );
  await expect(message.getByRole("button", { name: /^Remove / })).toHaveCount(
    0,
  );
});

async function readHeldReply(emailAccountId: string, replyBody: string) {
  return withClient(async (client) => {
    const result = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM "ScheduledEmail"
       WHERE "emailAccountId" = $1
         AND "heldForUndo"
         AND payload->'email'->>'messageHtml' LIKE $2
       LIMIT 1`,
      [emailAccountId, `%${replyBody}%`],
    );
    return result.rows[0];
  });
}
