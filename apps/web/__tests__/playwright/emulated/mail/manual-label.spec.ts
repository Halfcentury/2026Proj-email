import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

test("applies an existing label from the reader menu and keeps the conversation in inbox", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    "回复：阅读器导航测试邮件",
  );
  await conversation.click();
  await expect(
    page.getByRole("heading", { name: "回复：阅读器导航测试邮件" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /更多操作/ }).click();
  await page.getByRole("menuitem", { name: /标签/ }).click();
  const picker = page.getByRole("dialog", { name: "为会话添加标签" });
  await picker.getByRole("combobox").fill("Project");
  await expect(
    picker.getByRole("option", { name: "项目甲", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "search-label-picker");
  await picker.getByRole("option", { name: "项目甲", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("link", { name: "项目甲", exact: true }).last(),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_membership",
          threadId: "thr_playwright_reader",
          payload: {
            membership: "label",
            id: "Label_project",
            present: true,
          },
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({
      status: "succeeded",
      payload: { membership: "label", id: "Label_project", present: true },
    });
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_read_state",
          threadId: "thr_playwright_reader",
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ payload: { read: true }, status: "succeeded" });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/threads/thr_playwright_reader",
          { headers: { "X-Email-Account-ID": emailAccountId } },
        );
        if (!response.ok()) return false;
        const { thread } = await response.json();
        return (
          thread.messages?.length === 2 &&
          thread.messages.every((message: { labelIds?: string[] }) =>
            ["INBOX", "Label_project"].every((id) =>
              message.labelIds?.includes(id),
            ),
          )
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.getByRole("button", { name: "返回收件箱", exact: true }).click();
  await expect(conversation).toBeVisible();
  await expect(conversation.getByText("项目甲", { exact: true })).toBeVisible();
});

test("creates and applies a label to selected conversations with L", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const labelName = `Manual Projects ${testInfo.retry}`;
  const first = conversationWithSubject(
    page,
    conversations,
    "邮件功能测试邮件",
  );
  const second = conversationWithSubject(
    page,
    conversations,
    "已读状态测试邮件",
  );
  await first.getByRole("checkbox").click();
  await second.getByRole("checkbox").click();
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "为会话添加标签" });
  await expect(picker).toBeVisible();
  await picker.getByRole("combobox").fill(labelName);
  await expect(
    picker.getByRole("option", { name: `Create “${labelName}”` }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "create-label-picker");
  await picker.getByRole("option", { name: `Create “${labelName}”` }).click();
  await expect(picker).toBeHidden();
  await expect(first.getByText(labelName, { exact: true })).toBeVisible();
  await expect(second.getByText(labelName, { exact: true })).toBeVisible();
  const labelsResponse = await page.request.get("/api/labels", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  const { labels } = await labelsResponse.json();
  const label = labels.find(
    (label: { name: string }) => label.name === labelName,
  );
  expect(label).toBeTruthy();
  for (const threadId of ["thr_playwright_1", "thr_playwright_2"]) {
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "set_membership",
            threadId,
            payload: { membership: "label", id: label.id, present: true },
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/threads/${threadId}`, {
            headers: { "X-Email-Account-ID": emailAccountId },
          });
          if (!response.ok()) return false;
          const { thread } = await response.json();
          return thread.messages?.every((message: { labelIds?: string[] }) =>
            ["INBOX", label.id].every((id) => message.labelIds?.includes(id)),
          );
        },
        { timeout: 60_000 },
      )
      .toBe(true);
  }
});

test("L labels the open conversation after it leaves the unread list, and its chip removes the label", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    "第二封未读操作测试邮件",
  );
  // Restore unread state through the UI so retries do not inherit the prior read.
  await conversation.click();
  await expect(
    page.getByRole("heading", { name: "第二封未读操作测试邮件" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "会话操作" })
    .getByRole("button", { name: /标为未读/ })
    .click();
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_read_state",
          threadId: "thr_playwright_3",
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ payload: { read: false }, status: "succeeded" });
  await expect(page).not.toHaveURL(/thread-id=/);
  await expect(conversations).toBeVisible();
  const emptyReader = page.getByText("未选择邮件", { exact: true });
  if (!(await emptyReader.isVisible())) {
    await page.getByRole("button", { name: "切换列表或分栏视图" }).click();
  }
  await expect(emptyReader).toBeVisible();
  await page.getByRole("button", { name: "未读", exact: true }).click();
  await conversation.click();
  const heading = page.getByRole("heading", {
    name: "第二封未读操作测试邮件",
  });
  await expect(heading).toBeVisible();
  // In split view the list stays mounted: disappearance now proves filtering,
  // rather than just switching from the list to the reader before it is ready.
  await expect(conversations).toBeVisible();
  await expect(conversation).toHaveCount(0);
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "为会话添加标签" });
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(heading).toBeVisible();
  await expect(page.locator("body")).toBeFocused();
  await page.keyboard.press("l");
  await picker.getByRole("combobox").fill("项目甲");
  await expect(
    picker.getByRole("option", { name: "项目甲", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(heading).toBeVisible();
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_membership",
          threadId: "thr_playwright_3",
          payload: {
            membership: "label",
            id: "Label_project",
            present: true,
          },
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/threads/thr_playwright_3",
          { headers: { "X-Email-Account-ID": emailAccountId } },
        );
        if (!response.ok()) return false;
        const { thread } = await response.json();
        return ["INBOX", "Label_project"].every((id) =>
          thread.messages[0]?.labelIds?.includes(id),
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  const removeLabel = page.getByRole("button", {
    name: "Remove 项目甲 label",
  });
  // The remove control only takes pointer events while its chip is hovered.
  await removeLabel.locator("..").hover();
  await removeLabel.click();
  await expect(removeLabel).toBeHidden();
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_membership",
          threadId: "thr_playwright_3",
          payload: {
            membership: "label",
            id: "Label_project",
            present: false,
          },
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/threads/thr_playwright_3",
          { headers: { "X-Email-Account-ID": emailAccountId } },
        );
        if (!response.ok()) return true;
        const { thread } = await response.json();
        return thread.messages[0]?.labelIds?.includes("Label_project");
      },
      { timeout: 60_000 },
    )
    .toBe(false);
});

test("keeps a queued label visible while provider execute is held", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    "键盘导航测试邮件",
  );
  await conversation.getByRole("checkbox").click();
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "为会话添加标签" });
  const labelOption = picker.getByRole("option", {
    name: "项目甲",
    exact: true,
  });
  await expect(labelOption).toBeVisible();

  let releaseExecute = () => {};
  const held = new Promise<void>((resolve) => {
    releaseExecute = resolve;
  });
  await page.route(
    "**/api/mail/v1/accounts/**/operations/**",
    async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await held;
      await route.continue();
    },
  );

  try {
    await labelOption.click();
    await expect(picker).toBeHidden();
    await expect(
      conversation.getByText("项目甲", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_membership",
          threadId: "thr_playwright_keyboard",
          payload: {
            membership: "label",
            id: "Label_project",
            present: true,
          },
        }),
      )
      .toMatchObject({ status: "reconciling" });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "label-queued-before-dispatch",
    );
  } finally {
    releaseExecute();
  }

  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_membership",
          threadId: "thr_playwright_keyboard",
          payload: {
            membership: "label",
            id: "Label_project",
            present: true,
          },
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "/api/threads/thr_playwright_keyboard",
          { headers: { "X-Email-Account-ID": emailAccountId } },
        );
        if (!response.ok()) return false;
        const { thread } = await response.json();
        return ["INBOX", "Label_project"].every((id) =>
          thread.messages[0]?.labelIds?.includes(id),
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});
