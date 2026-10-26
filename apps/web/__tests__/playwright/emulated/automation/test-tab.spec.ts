import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAutomationOnboardingViewed } from "./automation-tabs-test-helpers";

for (const custom of [false, true]) {
  test(`can test ${custom ? "custom content" : "an email"} after browser translation replaces button text`, async ({
    page,
  }) => {
    const emailAccountId = await getEmailAccountId(page);
    await markAutomationOnboardingViewed(page);
    await page.goto(`/${emailAccountId}/automation?tab=test&custom=${custom}`);
    if (custom) {
      await page
        .locator("textarea[name=content]")
        .fill("A routine project update.");
    }
    const scope = custom
      ? page.locator("form").filter({ has: page.locator("textarea") })
      : page.getByRole("row").filter({ hasText: "邮件功能测试邮件" });
    const button = scope.getByRole("button", { name: "测试", exact: true });
    await expect(button).toBeVisible();

    await button.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Node[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        if (!node.textContent?.trim()) continue;
        // Translation replaces React's text nodes with its own elements.
        const translated = document.createElement("font");
        translated.textContent = node.textContent;
        node.parentNode?.replaceChild(translated, node);
      }
    });

    const actionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
    );
    await button.click();
    await actionResponse;
    await expect(scope).toBeVisible();
    if (custom) {
      await expect(page.getByText("测试结果", { exact: true })).toBeVisible();
    } else {
      await expect(
        scope.getByRole("button", { name: "重新测试", exact: true }),
      ).toBeEnabled();
    }
  });
}

test("preserves search, custom email, and Apply workspace state", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);

  const messagesResponse = await page.request.get("/api/messages", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  expect(messagesResponse.ok()).toBeTruthy();

  await page.goto(`/${emailAccountId}/automation?tab=test`);
  await expect(
    page.getByRole("button", { name: "测试", exact: true }),
  ).toHaveAttribute("data-selected", "true");
  const search = page.getByPlaceholder("搜索邮件…");
  await search.fill("邮件功能测试邮件");
  await search.press("Enter");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("search") === "邮件功能测试邮件",
  );
  await expect(search).toHaveValue("邮件功能测试邮件");

  await page.getByRole("button", { name: "自定义" }).click();
  const customContent = page.getByPlaceholder(
    "粘贴邮件内容或自行填写，例如：Stripe 发送的 49 美元付款收据",
  );
  await expect(customContent).toBeVisible();
  await customContent.fill("A custom receipt from the emulator workspace");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("custom") === "true",
  );

  const modeSwitch = page.getByRole("switch");
  await expect(async () => {
    if (!(await modeSwitch.isChecked())) await modeSwitch.click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("mode") === "apply",
      { timeout: 5000 },
    );
    await expect(page.getByRole("button", { name: "对全部执行" })).toBeVisible({
      timeout: 5000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(
    page.getByText("对历史邮件执行规则", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(modeSwitch).toBeChecked();
  await expect(search).toHaveValue("邮件功能测试邮件");
  await expect(page.getByRole("button", { name: "对全部执行" })).toBeVisible({
    timeout: 60_000,
  });
  await modeSwitch.click();
  await expect(page.getByRole("button", { name: "测试全部" })).toBeVisible();
  await expect(customContent).toBeVisible();
});
