import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
} from "./mail-test-helpers";

// Attaching uploads the file to the mailbox draft before the send, so this
// flow is slower than the attachment-free send the other compose specs cover.
const ATTACHMENT_SEND_TIMEOUT_MS = 180_000;
const UPLOAD_TIMEOUT_MS = 90_000;

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("sends a new message with an image attachment", async ({
  page,
}, testInfo) => {
  test.setTimeout(ATTACHMENT_SEND_TIMEOUT_MS + 120_000);
  await sendAndVerifyAttachment(page, {
    subject: `图片附件发送验收 ${testInfo.retry}`,
    file: {
      name: "图片示例.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    },
  });
});

test("sends a new message with an attachment too large for one request", async ({
  page,
}, testInfo) => {
  test.setTimeout(ATTACHMENT_SEND_TIMEOUT_MS + 120_000);
  await sendAndVerifyAttachment(page, {
    subject: `大文件附件发送验收 ${testInfo.retry}`,
    file: {
      name: "大文件示例.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(
        Uint8Array.from(
          { length: 3 * 1024 * 1024 + 4321 },
          (_, index) => (index * 13) % 256,
        ),
      ),
    },
  });
});

async function sendAndVerifyAttachment(
  page: Page,
  {
    subject,
    file,
  }: {
    subject: string;
    file: { name: string; mimeType: string; buffer: Buffer };
  },
) {
  const { conversations, emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: /写邮件/ }).click();
  const dialog = page.getByRole("dialog", { name: "新邮件" });
  await dialog
    .getByRole("combobox", { name: "收件人", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("主题").fill(subject);
  await dialog
    .getByRole("textbox", { name: "邮件内容" })
    .fill("文件已附上，请查收。");
  await dialog.getByTestId("compose-attachments-input").setInputFiles(file);
  const attachments = dialog.getByRole("list", { name: "附件" });
  await expect(attachments).toContainText(file.name);
  await expect(attachments.locator("li[aria-busy]")).toHaveCount(0, {
    timeout: UPLOAD_TIMEOUT_MS,
  });

  await dialog.getByRole("button", { name: "发送", exact: true }).click();

  // The composer stays open and reports the failure when the attachment
  // isn't on the mailbox draft, so a closed composer is the first signal.
  await expect(dialog).toBeHidden({ timeout: UPLOAD_TIMEOUT_MS });
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "compose:new-message",
        }),
      { timeout: ATTACHMENT_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });

  // A send that lost the file on its way to the provider still reports
  // success, so read the delivered message back off the provider.
  await openMailboxFromSidebar(page, "Sent");
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await expect(sentConversation).toBeVisible({ timeout: 60_000 });
  await sentConversation.click();
  const attachment = page.getByText(file.name, { exact: true });
  await expect(attachment).toBeVisible({ timeout: 60_000 });

  const download = page.waitForEvent("download");
  await attachment.locator("..").getByRole("button", { name: "下载" }).click();
  const savedFile = await download;
  const savedPath = await savedFile.path();
  expect(savedPath).not.toBeNull();
  expect(await readFile(savedPath!)).toEqual(file.buffer);
}
