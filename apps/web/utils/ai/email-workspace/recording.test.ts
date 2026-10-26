import { beforeEach, describe, it, expect, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  prepareMeetingRecording,
  configureMeetingRecording,
} from "./recording";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
const { settings, join, source } = vi.hoisted(() => ({
  settings: vi.fn(),
  join: vi.fn(),
  source: vi.fn(),
}));
vi.mock("@/utils/actions/meeting-recorder", () => ({
  updateMeetingRecorderSettingsAction: settings,
  setMeetingJoinOverrideAction: join,
}));
vi.mock("./resources", () => ({ getWorkspaceMessage: source }));
const options = {
  emailAccountId: "a",
  provider: "google",
  logger: createTestLogger(),
};
beforeEach(() => {
  vi.clearAllMocks();
  source.mockResolvedValue({});
  prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
    meetingRecorderEnabled: false,
  } as never);
  settings.mockResolvedValue({ data: undefined });
  join.mockResolvedValue({ data: undefined });
});
describe("recording confirmation", () => {
  it("changes settings only after confirmation and accepts the existing void action success", async () => {
    const plan = await prepareMeetingRecording(options, {
      threadId: "t",
      messageId: "m",
      enabled: true,
    });
    expect(settings).not.toHaveBeenCalled();
    await expect(
      configureMeetingRecording("a", plan.reviewToken),
    ).resolves.toMatchObject({ success: true });
    expect(settings).toHaveBeenCalledWith("a", { enabled: true });
  });
  it("rejects confirmation after current settings changed", async () => {
    const plan = await prepareMeetingRecording(options, {
      threadId: "t",
      messageId: "m",
      enabled: true,
    });
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      meetingRecorderEnabled: true,
    } as never);
    await expect(
      configureMeetingRecording("a", plan.reviewToken),
    ).rejects.toThrow("已变化");
    expect(settings).not.toHaveBeenCalled();
  });
  it("rejects a different account before the recorder action", async () => {
    const plan = await prepareMeetingRecording(options, {
      threadId: "t",
      messageId: "m",
      enabled: true,
    });
    await expect(
      configureMeetingRecording("b", plan.reviewToken),
    ).rejects.toThrow("其他邮箱");
    expect(settings).not.toHaveBeenCalled();
  });
  it("keeps provider errors visible", async () => {
    const plan = await prepareMeetingRecording(options, {
      threadId: "t",
      messageId: "m",
      enabled: true,
    });
    settings.mockResolvedValue({ serverError: "Calendar unavailable" });
    await expect(
      configureMeetingRecording("a", plan.reviewToken),
    ).rejects.toThrow("Calendar unavailable");
  });
});
