import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  openAttachments,
  resetAttachmentTestState,
  setupAttachmentTestState,
} from "./attachment-test-helpers";

test.beforeEach(async () => {
  await setupAttachmentTestState();
});

test.afterEach(async () => {
  await resetAttachmentTestState();
});

test("uses Drive folders to complete auto-file attachment setup", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  await openAttachments(page);

  await expect(page.getByRole("heading", { name: "配置自动整理" })).toBeVisible(
    { timeout: 60_000 },
  );
  await expect(page.getByText("Google Drive", { exact: true })).toBeVisible();
  await expect(page.getByText("测试文档", { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const createdFolderName = `Playwright Receipts ${process.env.PLAYWRIGHT_RUN_ID}-${testInfo.retry}`;
  await page.getByRole("button", { name: "Add folder" }).click();
  const createFolderDialog = page.getByRole("dialog", {
    name: "创建文件夹",
  });
  await createFolderDialog.getByLabel("文件夹名称").fill(createdFolderName);
  await createFolderDialog.getByRole("button", { name: "创建文件夹" }).click();
  await expect(page.getByText("文件夹已创建！", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(createdFolderName, { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const smokeDocsCheckbox = page.locator("#folder-drv_root_child");
  await smokeDocsCheckbox.click();
  await expect(smokeDocsCheckbox).toBeChecked();

  await page
    .locator('textarea[name="filingPrompt"]')
    .fill("File receipts and invoices in 测试文档.");
  const previewButton = page.getByRole("button", {
    name: "使用近期邮件预览",
  });
  await expect(previewButton).toBeEnabled({ timeout: 60_000 });
  await previewButton.click();

  await expectPreviewedSeedAttachment(page);
  await page.getByRole("button", { name: "结果正确，启动自动整理" }).click();

  await expect(page.getByRole("heading", { name: "自动整理附件" })).toBeVisible(
    { timeout: 60_000 },
  );
  await expect(page.getByText("Google Drive", { exact: true })).toBeVisible();
  await expect(page.getByText("允许的文件夹", { exact: true })).toBeVisible();
  await expect(page.getByText("测试文档", { exact: true })).toBeVisible();
});

// The shared emulator seed includes an inbox message carrying
// 邮件图片.png, so the preview always finds at least that attachment
// and the empty state is unreachable.
async function expectPreviewedSeedAttachment(
  page: Parameters<typeof openAttachments>[0],
) {
  await expect(page.getByText("邮件图片.png", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    page.getByRole("button", { name: "结果正确，启动自动整理" }),
  ).toBeEnabled({ timeout: 120_000 });
}
