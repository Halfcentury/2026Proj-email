import { decryptToken } from "@/utils/encryption";
import { Client } from "pg";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import {
  setupCalendarTestState,
  resetCalendarTestState,
} from "../calendars/calendar-test-helpers";
import {
  prepareMeetingBotFixture,
  cleanUpMeetingBotFixture,
} from "../meetings/meeting-bot-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
async function withDb<T>(operation: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return await operation(db);
  } finally {
    await db.end();
  }
}

test("creates a reviewed mail booking and handles provider failures without false success", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const { id, email } = await getEmailAccount(page);
  test.skip(
    !process.env.GOOGLE_BASE_URL?.includes("localhost"),
    "This fixture uses the local Google emulator only.",
  );
  const authHeaders = () =>
    withDb(async (db) => {
      const connection = (
        await db.query(
          'SELECT "accessToken" AS token FROM "CalendarConnection" WHERE "emailAccountId"=$1 ORDER BY "updatedAt" DESC LIMIT 1',
          [id],
        )
      ).rows[0];
      const token =
        connection?.token ??
        (
          await db.query(
            'SELECT account.access_token FROM "Account" account JOIN "EmailAccount" ea ON ea."accountId"=account.id WHERE ea.id=$1',
            [id],
          )
        ).rows[0].access_token;
      return { Authorization: `Bearer ${decryptToken(token)}` };
    });
  const cleanProvider = async () => {
    const headers = await authHeaders();
    for (const calendarId of ["primary", email]) {
      const base = `${process.env.GOOGLE_BASE_URL}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
      const response = await page.request.get(base, { headers });
      if (!response.ok()) continue;
      for (const event of (await response.json()).items ?? []) {
        if (
          event.summary?.startsWith("邮件预约测试") &&
          event.summary.includes("预约测试客户")
        )
          await page.request.delete(`${base}/${event.id}`, { headers });
      }
    }
  };
  await cleanProvider();
  await setupCalendarTestState();
  try {
    await withDb(async (db) => {
      await db.query('DELETE FROM "BookingLink" WHERE id=$1', [
        "qa-mail-booking",
      ]);
      await db.query('DELETE FROM "AvailabilitySchedule" WHERE id=$1', [
        "qa-mail-schedule",
      ]);
      await db.query(
        'INSERT INTO "AvailabilitySchedule" (id,"createdAt","updatedAt",name,"emailAccountId") VALUES ($1,NOW(),NOW(),$2,$3)',
        ["qa-mail-schedule", "邮件预约测试", id],
      );
      for (let day = 0; day < 7; day++)
        await db.query(
          'INSERT INTO "AvailabilityWindow" (id,"createdAt","updatedAt",weekday,"startMinutes","endMinutes","availabilityScheduleId") VALUES ($1,NOW(),NOW(),$2,540,1080,$3)',
          [`qa-mail-window-${day}`, day, "qa-mail-schedule"],
        );
      await db.query(
        'INSERT INTO "BookingLink" (id,"createdAt","updatedAt",slug,title,"durationMinutes","slotIntervalMinutes","emailAccountId","availabilityScheduleId","destinationCalendarId","minimumNoticeMinutes") VALUES ($1,NOW(),NOW(),$2,$3,30,30,$4,$5,$6,0)',
        [
          "qa-mail-booking",
          "qa-mail-booking",
          "邮件预约测试",
          id,
          "qa-mail-schedule",
          `${id}-playwright-primary-calendar`,
        ],
      );
    });
    await page.goto(`/${id}/mail`);
    const row = page
      .getByRole("listbox", { name: "会话" })
      .getByRole("option")
      .first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();
    await expect(page).toHaveURL(/thread-id=/);
    const threadId = new URL(page.url()).searchParams.get("thread-id")!;
    await page.getByRole("button", { name: "打开邮件 AI 助手" }).click();
    const panel = page.getByTestId("email-ai-panel");
    await panel.getByRole("tab", { name: "操作", exact: true }).click();
    await panel.getByRole("textbox", { name: "查询时区" }).fill("UTC");
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 2);
    start.setUTCHours(10, 0, 0, 0);
    const changed = new Date(start.getTime() + 86_400_000);
    await panel
      .getByRole("textbox", { name: "开始时间", exact: true })
      .fill(start.toISOString().slice(0, 16));
    await panel.getByText("从这封邮件安排预约", { exact: true }).click();
    await panel
      .getByRole("textbox", { name: "参与人姓名" })
      .fill("预约测试客户");
    await panel
      .getByRole("textbox", { name: "参与人邮箱" })
      .fill("qa-appointment@example.com");
    if (process.env.EMAIL_QA_LLM_URL) {
      const base = process.env.EMAIL_QA_LLM_URL.replace(/\/v1\/?$/, "");
      await page.request.post(`${base}/__emulator/replies`, {
        data: {
          match: "Prepare a proposed booking from the email",
          object: {
            operation: "create",
            bookingId: null,
            bookingLinkId: "qa-mail-booking",
            startTime: start.toISOString(),
            timezone: "UTC",
            guestName: "预约测试客户",
            guestEmail: "qa-appointment@example.com",
            reason: "按已确认的参与人和时间准备预约",
            missingInformation: [],
          },
        },
      });
      await panel
        .getByRole("textbox", { name: "预约要求" })
        .fill(
          `请在 ${start.toISOString()} UTC 为 预约测试客户（qa-appointment@example.com）准备邮件预约测试。`,
        );
      await panel
        .getByRole("button", { name: "根据邮件准备预约方案", exact: true })
        .click();
      expect(
        (
          await withDb((db) =>
            db.query('SELECT id FROM "Booking" WHERE "bookingLinkId"=$1', [
              "qa-mail-booking",
            ]),
          )
        ).rowCount,
      ).toBe(0);
    } else
      await panel.getByRole("button", { name: "准备预约，查看后确认" }).click();
    await expect(
      panel.getByText("确认创建预约", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "确认执行", exact: true })
      .scrollIntoViewIfNeeded();
    await capturePlaywrightCheckpoint(page, testInfo, "email-booking-review");
    await panel.getByRole("button", { name: "确认执行", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "已完成", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    const readBooking = () =>
      withDb(
        async (db) =>
          (
            await db.query(
              'SELECT * FROM "Booking" WHERE "bookingLinkId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
              ["qa-mail-booking"],
            )
          ).rows[0],
      );
    const booking = await readBooking();
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.providerEventId).toBeTruthy();
    expect(booking.sourceContext).toMatchObject({
      emailAccountId: id,
      threadId,
    });
    const providerEvent = async () => {
      const response = await page.request.get(
        `${process.env.GOOGLE_BASE_URL}/calendar/v3/calendars/${encodeURIComponent(booking.providerCalendarId)}/events?maxResults=2500`,
        { headers: await authHeaders() },
      );
      expect(response.status(), "Google emulator event-list status").toBe(200);
      return (await response.json()).items?.find(
        (event: { id: string }) => event.id === booking.providerEventId,
      );
    };
    let provider = await providerEvent();
    expect(
      provider,
      "Created event must exist in the provider calendar",
    ).toBeTruthy();
    expect(new Date(provider.start.dateTime).toISOString()).toBe(
      start.toISOString(),
    );
    await panel.getByRole("button", { name: "刷新预约记录" }).click();
    await expect(
      panel.getByRole("button", { name: "改到所选开始时间" }),
    ).toBeVisible();
    await panel
      .getByRole("textbox", { name: "开始时间", exact: true })
      .fill(changed.toISOString().slice(0, 16));
    await panel.getByRole("button", { name: "改到所选开始时间" }).click();
    await expect(
      panel.getByText("确认更改预约", { exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "确认执行", exact: true }).click();
    const rescheduleError = panel
      .getByRole("alert")
      .filter({ hasText: "Failed to update calendar event" });
    await expect(
      panel
        .getByRole("button", { name: "已完成", exact: true })
        .or(rescheduleError),
    ).toBeVisible({ timeout: 60_000 });
    const rescheduled = !(await rescheduleError.isVisible());
    const expectedTime = rescheduled
      ? changed.toISOString()
      : start.toISOString();
    expect(new Date((await readBooking()).startTime).toISOString()).toBe(
      expectedTime,
    );
    provider = await providerEvent();
    expect(new Date(provider.start.dateTime).toISOString()).toBe(expectedTime);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      rescheduled
        ? "email-booking-rescheduled"
        : "email-booking-provider-failure",
    );
    // Simulate a stale provider reference without changing the actual event.
    await withDb((db) =>
      db.query(
        'UPDATE "Booking" SET "providerCalendarId"=$1,"updatedAt"=NOW() WHERE id=$2',
        ["qa-unreachable-calendar", booking.id],
      ),
    );
    await panel.getByRole("button", { name: "刷新预约记录" }).click();
    await panel.getByRole("button", { name: "准备取消", exact: true }).click();
    await expect(
      panel.getByText("确认取消预约", { exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "确认执行", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: /^(已完成|请核对日历)$/ }),
    ).toBeVisible({ timeout: 60_000 });
    expect((await readBooking()).status).toBe("CANCELED");
    await expect(
      panel.getByRole("button", { name: "请核对日历", exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("已取消", { exact: true })).toBeVisible();
    provider = await providerEvent();
    if (provider && provider.status !== "cancelled")
      await expect(
        panel
          .getByRole("alert")
          .getByText(
            "预约状态已取消，但日历取消未能确认。请到日历核对，避免重复操作。",
            { exact: true },
          ),
      ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-booking-completed",
    );
  } finally {
    await cleanProvider();
    await withDb(async (db) => {
      await db.query('DELETE FROM "BookingLink" WHERE id=$1', [
        "qa-mail-booking",
      ]);
      await db.query('DELETE FROM "AvailabilitySchedule" WHERE id=$1', [
        "qa-mail-schedule",
      ]);
    });
    await resetCalendarTestState();
  }
});

test("opens the exact recorded meeting from a source link while recording is off", async ({
  page,
}, testInfo) => {
  const fixture = await prepareMeetingBotFixture(page);
  try {
    await page.goto(
      `/${fixture.emailAccountId}/meetings?meeting-id=${fixture.recordedMeetingId}`,
    );
    const dialog = page.getByRole("dialog", {
      name: "产品复盘会议记录",
    });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText("团队确定了入门流程改进的发布计划。");
    await expect(dialog).toContainText("准备客户公告。");
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "email-meeting-source-detail",
    );
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page).not.toHaveURL(/meeting-id=/);
  } finally {
    await cleanUpMeetingBotFixture(fixture);
  }
});
