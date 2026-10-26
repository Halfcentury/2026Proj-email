import { describe, expect, it, vi } from "vitest";
import {
  buildSnoozeCommandPalette,
  getSnoozePresets,
  parseSnoozeDate,
} from "./snooze-command-palette";

describe("buildSnoozeCommandPalette", () => {
  it("offers a short list of days and shows when each one lands", () => {
    const now = new Date(2026, 7, 18, 10);
    const commands = buildSnoozeCommandPalette({
      now,
      onSnooze: vi.fn(),
      query: "",
    });

    expect(
      commands.map((command) => [command.label, command.description]),
    ).toEqual([
      ["明天", "8月19日 周三 09:00"],
      ["本周五", "8月21日 周五 09:00"],
      ["本周末", "8月22日 周六 09:00"],
      ["下周", "8月24日 周一 09:00"],
    ]);
  });

  it("drops presets that have passed or would land on the same day", () => {
    const presetIdsOn = (date: Date) =>
      getSnoozePresets(date).map(({ id }) => id);

    // Thursday: tomorrow is already Friday
    expect(presetIdsOn(new Date(2026, 7, 20, 10))).toEqual([
      "tomorrow",
      "this-weekend",
      "next-week",
    ]);
    // Friday: tomorrow is already the weekend
    expect(presetIdsOn(new Date(2026, 7, 21, 10))).toEqual([
      "tomorrow",
      "next-week",
    ]);
    // Saturday
    expect(presetIdsOn(new Date(2026, 7, 22, 10))).toEqual([
      "tomorrow",
      "next-week",
    ]);
    // Sunday: tomorrow is already next week
    expect(presetIdsOn(new Date(2026, 7, 23, 10))).toEqual([
      "tomorrow",
      "end-of-week",
    ]);
  });

  it("turns natural language into one actionable result", () => {
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now: new Date(2026, 7, 15, 10),
      onSnooze,
      query: "tomorrow at 3pm",
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.label).toContain("8月16日 周日 15:00");
    commands[0]?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, 16, 15));
  });

  it.each([
    "明天下午3点",
    "明天下午 3 点",
  ])("parses Chinese time input %s", (input) => {
    expect(parseSnoozeDate(input, new Date(2026, 7, 15, 10))).toEqual(
      new Date(2026, 7, 16, 15),
    );
  });

  it("uses 9am for a Chinese date and rejects a Chinese past date", () => {
    const now = new Date(2026, 7, 15, 10);
    expect(parseSnoozeDate("明天", now)).toEqual(new Date(2026, 7, 16, 9));
    expect(parseSnoozeDate("昨天", now)).toBeNull();
  });

  it("defaults date-only input to 9am", () => {
    expect(parseSnoozeDate("next Friday", new Date(2026, 7, 15, 10))).toEqual(
      new Date(2026, 7, 21, 9),
    );
  });

  it("does not offer invalid or past dates", () => {
    const now = new Date(2026, 7, 15, 10);

    expect(parseSnoozeDate("not a date", now)).toBeNull();
    expect(parseSnoozeDate("yesterday", now)).toBeNull();
  });
});
