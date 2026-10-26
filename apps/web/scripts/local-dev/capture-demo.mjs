import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const ROOT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const SCREENSHOT_DIR = join(ROOT_DIR, ".tmp/demo-screenshots");
const runtime = JSON.parse(
  readFileSync(join(ROOT_DIR, ".context/local-dev/runtime.json"), "utf8"),
);
const BASE_URL = runtime.NEXT_PUBLIC_BASE_URL;

/** Exercise the running local app with its synthetic Google account and capture actual UI states. */
async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined,
    headless: process.env.DEMO_HEADLESS === "true",
  });
  const authPath = join(SCREENSHOT_DIR, "auth.json");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
    ...(existsSync(authPath) ? { storageState: authPath } : {}),
  });
  const page = await context.newPage();
  try {
    if (!existsSync(authPath)) {
      await page.goto(`${BASE_URL}/login?next=%2Fmail`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      const signIn = await page.evaluate(async () => {
        const response = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "/mail",
            errorCallbackURL: "/login/error",
          }),
        });
        if (!response.ok)
          throw new Error(`Local login failed: ${response.status}`);
        return response.json();
      });
      if (!["localhost", "127.0.0.1"].includes(new URL(signIn.url).hostname))
        throw new Error("Expected the local OAuth emulator");
      await page.goto(signIn.url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page
        .getByRole("button", { name: /developer@example\.com/ })
        .click();
      await page.waitForURL(`${BASE_URL}/**`, { timeout: 90_000 });
    }
    const accountResponse = await page.request.get(
      `${BASE_URL}/api/user/email-accounts`,
    );
    const account = (await accountResponse.json()).emailAccounts?.find(
      ({ email }) => email === "developer@example.com",
    );
    if (!account)
      throw new Error("The local demonstration account was not created");
    console.log("[demo] Demonstration account signed in");
    if (!process.argv.includes("--triage-only")) {
      await page.goto(`${BASE_URL}/${account.id}/mail`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForTimeout(10_000);
      await capture(page, "01-inbox.png");
    }
    await context.storageState({ path: join(SCREENSHOT_DIR, "auth.json") });
    await page.goto(`${BASE_URL}/${account.id}/mail-triage`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await expect(
      page.getByRole("heading", { name: "邮件整理", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await capture(page, "00-test-mailbox.png");
    await page.getByText("验收工具", { exact: true }).click();
    await page
      .getByRole("button", { name: "重置 12 封测试邮件", exact: true })
      .click();
    await page
      .getByRole("button", { name: "生成整理建议", exact: true })
      .click();
    await expect(page.getByTestId("triage-M02")).toContainText("仅知悉", {
      timeout: 25_000,
    });
    await expect(
      page.getByRole("checkbox", { name: "选择 M01", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "选择 M04", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await capture(page, "02-suggestions.png");
    await page.getByRole("checkbox", { name: "选择 M02", exact: true }).check();
    await page.getByRole("checkbox", { name: "选择 M03", exact: true }).check();
    await page
      .getByRole("button", { name: "确认归档（2）", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, "03-confirmation.png");
    await page.getByRole("button", { name: "执行归档", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "收件箱（10）", exact: true }),
    ).toBeVisible();
    await capture(page, "04-archived-inbox.png");
    const logs = page.getByRole("region", { name: "操作日志" });
    await expect(logs.getByRole("listitem")).toHaveCount(2);
    await expect(logs).toContainText("M02");
    await expect(logs).toContainText("M03");
    await logs.scrollIntoViewIfNeeded();
    await capture(page, "05-archive-log.png");
    console.log(
      JSON.stringify({
        url: `${BASE_URL}/${account.id}/mail-triage`,
        inbox: 10,
        allMessages: 12,
        archivedIds: ["M02", "M03"],
        screenshots: SCREENSHOT_DIR,
      }),
    );
  } catch (error) {
    await page
      .screenshot({ path: join(SCREENSHOT_DIR, "error.png"), fullPage: true })
      .catch(() => {});
    console.error(`[demo] ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

/** Capture the visible page after its fonts and current UI have settled. */
async function capture(page, filename) {
  await page.evaluate(() => document.fonts.ready);
  if (filename !== "05-archive-log.png")
    await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(SCREENSHOT_DIR, filename),
    animations: "disabled",
  });
  console.log(`[demo] Captured ${filename}`);
}

await main();
