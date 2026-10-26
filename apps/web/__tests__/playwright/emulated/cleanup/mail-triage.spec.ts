import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { MAIL_TRIAGE_TRUTH } from "@/__tests__/fixtures/mail-triage-truth";
import { createTriageFixtureMessages } from "@/utils/mail-triage/fixtures";

test.beforeEach(async ({ page }) => {
  const response = await page.request.post(
    `${process.env.PLAYWRIGHT_LLM_BASE_URL}/__emulator/replies`,
    {
      data: {
        match: "逐封分类",
        object: {
          suggestions: createTriageFixtureMessages().map((message) => ({
            messageId: message.id,
            category: MAIL_TRIAGE_TRUTH[message.id],
            evidence: [{ field: "body", quote: message.body }],
            explanation: "依据邮件正文给出建议。",
          })),
        },
      },
    },
  );
  expect(response.ok()).toBe(true);
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail-triage`);
  await expect(
    page.getByRole("heading", { name: "邮件整理", exact: true }),
  ).toBeVisible();
  await page.getByText("验收工具", { exact: true }).click();
  await page.getByRole("button", { name: "重置 12 封测试邮件" }).click();
  await expect(
    page.getByRole("button", { name: "收件箱（12）" }),
  ).toBeVisible();
});

test("T1 archives only M02 and M03 after explicit empty selection and confirmation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "生成整理建议", exact: true }).click();
  await expect(page.getByTestId("triage-M01")).toContainText("待处理");
  await expect(page.getByTestId("triage-M02")).toContainText("仅知悉");
  await expect(page.getByTestId("triage-M03")).toContainText("营销");
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "选择 M01", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "选择 M04", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "选择 M02", exact: true }).check();
  await page.getByRole("checkbox", { name: "选择 M03", exact: true }).check();
  await page.getByRole("button", { name: "确认归档（2）" }).click();
  await expect(
    page.getByRole("button", { name: "收件箱（12）", includeHidden: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "执行归档", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "收件箱（10）" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "操作日志" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "全部邮件（12）" }).click();
  await expect(page.getByTestId("triage-M02")).toContainText("已归档");
  await expect(page.getByTestId("triage-M03")).toContainText("已归档");
  await expect(page.getByTestId("triage-M04")).toContainText("星标保护");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "收件箱（10）" }),
  ).toBeVisible();
});

test("T2 preserves starred M04 until unstar, reanalysis and a separate archive confirmation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "生成整理建议", exact: true }).click();
  await expect(page.getByTestId("triage-M04")).toContainText("营销");
  await expect(
    page.getByRole("checkbox", { name: "选择 M04", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消星标 M04", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "星标 M04", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成整理建议", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "选择 M04", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: "选择 M04", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "收件箱（12）" }),
  ).toBeVisible();
});

test("T3 shows a retry and clears old selections without changing inbox or stars after 503 and timeout", async ({
  page,
}) => {
  await page.getByRole("button", { name: "生成整理建议", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 M02", exact: true }).check();
  for (const scenario of ["unavailable", "timeout"]) {
    await page.getByLabel("分析接口状态").selectOption(scenario);
    await page
      .getByRole("button", { name: "生成整理建议", exact: true })
      .click();
    const analysisError = page.getByRole("alert").filter({
      hasText: "分析失败，邮件未被修改，请重试",
    });
    await expect(analysisError).toContainText("分析失败，邮件未被修改，请重试");
    await expect(
      page.getByRole("button", { name: "收件箱（12）" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "取消星标 M04", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "操作日志" })).toContainText(
      "暂无归档记录",
    );
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByTestId("triage-M01")).toContainText("待处理");
    await expect(analysisError).toHaveCount(0);
  }
});
