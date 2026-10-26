import { expect, type Page } from "@playwright/test";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  waitForComposeOutboxSend,
} from "./mail-test-helpers";

test("saves a closed new message with attachments in Drafts and discards it from the mailbox", async ({
  page,
}, testInfo) => {
  const { emailAccountId, conversations } = await openMail(page);
  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "收件人", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("主题").fill("Mailbox draft example");
  await dialog
    .getByRole("textbox", { name: "邮件内容" })
    .fill("A saved example message.");
  await dialog.getByTestId("compose-attachments-input").setInputFiles({
    name: "example.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Example attachment"),
  });
  await dialog.getByRole("button", { name: "关闭写信窗口" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => {
      const drafts = await readMailboxDrafts(
        page,
        emailAccountId,
        "Mailbox draft example",
      );
      return (
        drafts.length === 1 &&
        drafts[0].attachments?.some((file) => file.filename === "example.txt")
      );
    })
    .toBe(true);
  await openMailboxFromSidebar(page, "Drafts");
  const draft = conversationWithSubject(
    page,
    conversations,
    "Mailbox draft example",
  );
  await expect(draft).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "new-message-in-mailbox-drafts",
  );
  await draft.click();
  await expect(page).toHaveURL(/thread-id=/);
  const threadId = new URL(page.url()).searchParams.get("thread-id");
  const detailUrl = new URL(
    `/api/threads/${threadId}?includeDrafts=true`,
    page.url(),
  );
  const mailboxResponse = await page.request.get(detailUrl.toString(), {
    headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
  });
  expect(mailboxResponse.ok()).toBe(true);
  const mailboxDraft: ThreadResponse = await mailboxResponse.json();
  expect(
    mailboxDraft.thread.messages.some((message) =>
      message.attachments?.some(
        (attachment) => attachment.filename === "example.txt",
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "返回收件箱" }).click();
  await page.reload();
  await page.getByRole("button", { name: /写邮件/ }).click();
  await expect(dialog.getByRole("textbox", { name: "邮件内容" })).toContainText(
    "A saved example message.",
  );
  await expect(dialog.getByRole("list", { name: "附件" })).toContainText(
    "example.txt",
  );
  await dialog.getByRole("button", { name: "丢弃草稿" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      readMailboxDrafts(page, emailAccountId, "Mailbox draft example"),
    )
    .toHaveLength(0);
  await page.reload();
  await expect(conversations).toBeVisible();
  await expect(
    conversationWithSubject(page, conversations, "Mailbox draft example"),
  ).toHaveCount(0);
});

test("removes the mailbox draft after sending a new message", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "收件人", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("主题").fill("Send saved example");
  await dialog
    .getByRole("textbox", { name: "邮件内容" })
    .fill("An example to send.");
  await expect
    .poll(() => readMailboxDrafts(page, emailAccountId, "Send saved example"), {
      timeout: 15_000,
    })
    .toHaveLength(1);
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await waitForComposeOutboxSend(page, emailAccountId);
  await expect
    .poll(() => readMailboxDrafts(page, emailAccountId, "Send saved example"))
    .toHaveLength(0);
});

test("saves a reply in the mailbox and reopens it after a reload", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 60_000 });
  await message.getByRole("button", { name: "回复", exact: true }).click();
  const editors = page.getByRole("textbox", { name: "邮件内容" });
  const replyBody = `A reply saved to the mailbox. ${testInfo.retry}`;
  await editors.fill(replyBody);
  await expect
    .poll(
      () =>
        readThreadDrafts(
          page,
          emailAccountId,
          "thr_playwright_reply",
          replyBody,
        ),
      { timeout: 15_000 },
    )
    .toHaveLength(1);
  // The mailbox copy syncs back into the thread without a second composer.
  await expect(editors).toHaveCount(1);

  await page.reload();
  await expect(editors).toHaveCount(1, { timeout: 60_000 });
  await expect(editors).toContainText(replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-draft-after-reload");

  await page.getByRole("button", { name: "丢弃草稿" }).click();
  await expect(editors).toHaveCount(0);
  await expect
    .poll(() =>
      readThreadDrafts(page, emailAccountId, "thr_playwright_reply", replyBody),
    )
    .toHaveLength(0);
});

async function readThreadDrafts(
  page: Page,
  emailAccountId: string,
  threadId: string,
  text: string,
) {
  const response = await page.request.get(
    new URL(
      `/api/threads/${threadId}?includeDrafts=true`,
      page.url(),
    ).toString(),
    { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
  );
  expect(response.ok()).toBe(true);
  const { thread }: ThreadResponse = await response.json();
  return thread.messages.filter(
    (message) =>
      message.labelIds?.includes("DRAFT") && message.textHtml?.includes(text),
  );
}

async function readMailboxDrafts(
  page: Page,
  emailAccountId: string,
  subject: string,
) {
  const response = await page.request.get(
    new URL("/api/threads?type=draft", page.url()).toString(),
    {
      headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
    },
  );
  expect(response.ok()).toBe(true);
  const body: ThreadsResponse = await response.json();
  return body.threads
    .flatMap((thread) => thread.messages)
    .filter((message) => message.headers.subject === subject);
}
