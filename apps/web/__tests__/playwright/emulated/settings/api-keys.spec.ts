import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { openSettings } from "./settings-test-helpers";

const API_KEY_NAME = `Playwright API key ${process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}-${Date.now()}`}`;

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupApiKeys(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("creates, authorizes, lists, and revokes an API key", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await cleanupApiKeys(emailAccountId);
  await openSettings(page);

  await expect(
    page.getByRole("heading", { name: "开发者", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "创建密钥" }).click();

  const createDialog = page.getByRole("dialog", {
    name: "创建新密钥",
  });
  await createDialog.getByLabel("名称（可选）").fill(API_KEY_NAME);
  await expect(createDialog.getByRole("checkbox")).toHaveCount(4);
  for (const name of ["Read rules", "Write rules", "Read stats"]) {
    await expect(createDialog.getByRole("checkbox", { name })).toBeChecked();
  }
  await expect(
    createDialog.getByRole("checkbox", { name: "Unsubscribe senders" }),
  ).not.toBeChecked();
  await createDialog.getByRole("button", { name: "创建" }).click();
  await expect(page.getByText("API 密钥已创建！", { exact: true })).toBeVisible(
    { timeout: 60_000 },
  );

  const secretKey = await createDialog
    .locator('input[name="copy-input"]')
    .inputValue();
  expect(secretKey.length).toBeGreaterThan(32);

  const authorizedResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": secretKey },
  });
  expect(authorizedResponse.status()).toBe(200);

  const invalidResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": "iz_invalid" },
  });
  expect(invalidResponse.status()).toBe(401);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /查看密钥/ }).click();
  const keysDialog = page.getByRole("dialog", { name: "API 密钥" });
  const keyRow = keysDialog.getByRole("row").filter({ hasText: API_KEY_NAME });
  await expect(keyRow).toContainText("Read rules");
  await keyRow.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("API 密钥已停用！", { exact: true })).toBeVisible(
    { timeout: 60_000 },
  );
  await expect(keyRow).toBeHidden({ timeout: 60_000 });

  const revokedResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": secretKey },
  });
  expect(revokedResponse.status()).toBe(401);
});

async function cleanupApiKeys(emailAccountId?: string) {
  if (!emailAccountId) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "ApiKey"
       WHERE "emailAccountId" = $1 AND name = $2`,
      [emailAccountId, API_KEY_NAME],
    );
  } finally {
    await client.end();
  }
}
