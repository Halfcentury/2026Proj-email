import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { isMicrosoftPlaywright } from "../mail-provider";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

for (const accountScope of ["single", "all"] as const) {
  test(`${accountScope}: searches the mailbox and clears back to the inbox`, async ({
    page,
  }) => {
    const { conversations, emailAccountId } = await openMail(page);
    if (accountScope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const options = conversations.getByRole("option");
    await expect(options.first()).toBeVisible();

    const matching = conversationWithSubject(
      page,
      conversations,
      "归档操作测试邮件",
    );
    const nonMatching = conversationWithSubject(
      page,
      conversations,
      "键盘导航测试邮件",
    );
    await expect(matching).toBeVisible();
    await expect(nonMatching).toBeVisible();

    const searchInput = page.getByPlaceholder("搜索邮件");
    await searchInput.fill("归档操作");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/[?&]q=/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("归档操作");
    await expect(matching).toBeVisible();
    await expect(nonMatching).toHaveCount(0);

    await page.getByRole("button", { name: "清除搜索" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(matching).toBeVisible();
    await expect(nonMatching).toBeVisible();
  });

  test(`${accountScope}: slash focuses search and Command K opens commands`, async ({
    page,
  }) => {
    const { emailAccountId } = await openMail(page);
    if (accountScope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const searchInput = page.getByPlaceholder("搜索邮件");
    await expect(searchInput).toBeVisible();
    await page.getByRole("listbox", { name: "会话" }).click();

    await page.keyboard.press("Slash");

    await expect(searchInput).toBeFocused();
    await page.keyboard.press(
      `${process.platform === "darwin" ? "Meta" : "Control"}+k`,
    );
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

test("advanced search composes Gmail operators and restores them", async ({
  page,
}, testInfo) => {
  test.skip(
    isMicrosoftPlaywright(),
    "Advanced search operators are Gmail query syntax.",
  );
  await openMail(page);

  await page.getByRole("button", { name: "显示搜索选项" }).click();
  const filters = page.getByRole("form", { name: "搜索选项" });
  await expect(filters).toBeVisible();
  await filters.getByLabel("发件人").fill("alice@example.com");
  await filters.getByLabel("主题").fill("weekly report");
  await filters.getByLabel("包含附件").click();
  await capturePlaywrightCheckpoint(filters, testInfo, "mail-advanced-search");
  await filters.getByRole("button", { name: "搜索" }).click();

  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe(
    'from:alice@example.com subject:"weekly report" has:attachment',
  );
  await expect(page.getByPlaceholder("搜索邮件")).toHaveValue(
    'from:alice@example.com subject:"weekly report" has:attachment',
  );

  await page.getByRole("button", { name: "显示搜索选项" }).click();
  const restored = page.getByRole("form", { name: "搜索选项" });
  await expect(restored.getByLabel("发件人")).toHaveValue("alice@example.com");
  await expect(restored.getByLabel("主题")).toHaveValue("weekly report");
  await expect(restored.getByLabel("包含附件")).toBeChecked();
});

test("advanced search panel stays aligned with the search field", async ({
  page,
}) => {
  await openMail(page);

  // The modal popover hides the toolbar from the accessibility tree, so the
  // field has to be measured before it opens.
  const searchField = await page.getByRole("search").boundingBox();
  await page.getByRole("button", { name: "显示搜索选项" }).click();
  await expect(page.getByRole("form", { name: "搜索选项" })).toBeVisible();
  if (!searchField) throw new Error("missing search field bounding box");
  // The popover animates into place; measure the settled alignment.
  await expect
    .poll(async () => {
      const panel = await page.getByRole("dialog").boundingBox();
      return panel
        ? Math.abs(panel.x - searchField.x)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(8);
});

test("advanced search still filters the mailbox by Has the words", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const matching = conversationWithSubject(
    page,
    conversations,
    "归档操作测试邮件",
  );
  const nonMatching = conversationWithSubject(
    page,
    conversations,
    "键盘导航测试邮件",
  );
  await expect(matching).toBeVisible();
  await expect(nonMatching).toBeVisible();

  await page.getByRole("button", { name: "显示搜索选项" }).click();
  const filters = page.getByRole("form", { name: "搜索选项" });
  await filters
    .getByLabel(isMicrosoftPlaywright() ? "关键词" : "包含以下文字")
    .fill("归档操作");
  await filters.getByRole("button", { name: "搜索" }).click();

  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("归档操作");
  await expect(matching).toBeVisible();
  await expect(nonMatching).toHaveCount(0);
});

test("search suggests contacts and recent searches", async ({
  page,
}, testInfo) => {
  await page.route("**/api/user/contacts?*", async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get("query") ?? "";
    await route.fulfill({
      json: {
        contacts: query.startsWith("ali")
          ? [{ name: "艾丽斯", emailAddress: "alice@example.com" }]
          : [],
      },
    });
  });
  await openMail(page);

  const searchInput = page.getByPlaceholder("搜索邮件");
  // The forms plugin sizes untyped inputs at 1rem; the field must stay on the
  // toolbar's 14px ramp.
  await expect(searchInput).toHaveCSS("font-size", "14px");
  await searchInput.fill("ali");
  const suggestions = page.getByRole("listbox", { name: "搜索建议" });
  await expect(
    suggestions.getByRole("option", { name: /艾丽斯/ }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-search-suggestions");

  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("alice@example.com");
  await expect(suggestions).toHaveCount(0);

  // Escape from outside the field still leaves the search.
  await searchInput.blur();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/[?&]q=/);
  await searchInput.click();
  const recent = suggestions.getByRole("option", {
    name: "alice@example.com",
  });
  await expect(recent).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-search-recent");

  await searchInput.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(searchInput).toBeFocused();

  await searchInput.fill("exa");
  await recent.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("alice@example.com");
});
