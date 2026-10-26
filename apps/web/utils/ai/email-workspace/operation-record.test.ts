import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  getWorkspaceOperationReceipt,
  recordWorkspaceOperation,
  workspaceReviewKey,
} from "./operation-record";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
beforeEach(() => vi.clearAllMocks());
describe("confirmation outcome persistence", () => {
  it("restores an account-scoped receipt without re-executing an operation", async () => {
    const receipt = {
      completedAt: "2026-10-26T00:00:00Z",
      issues: ["请核对日历"],
    };
    prisma.chatMessage.findFirst.mockResolvedValue({
      metadata: { workspaceOperation: receipt },
    } as any);
    expect(await getWorkspaceOperationReceipt("a", "signed-token")).toEqual(
      receipt,
    );
    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: `workspace-operation:${workspaceReviewKey("signed-token")}`,
          chat: { emailAccountId: "a", deletedAt: null },
        },
      }),
    );
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
  it("preserves other tool parts while persisting the executed outcome in chat context", async () => {
    const key = workspaceReviewKey("signed-token");
    prisma.chatMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ chatId: "chat" } as any);
    const parts = [
      { type: "text", text: "确认此预约" },
      {
        type: "tool-manageBooking",
        output: { reviewToken: "signed-token", calendarName: "日历" },
      },
    ];
    const updatedAt = new Date();
    prisma.chatMessage.findMany.mockResolvedValue([
      { id: "m", parts, updatedAt },
    ] as any);
    const receipt = { completedAt: new Date().toISOString(), issues: [] };
    await recordWorkspaceOperation("a", "signed-token", "thread", receipt);
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chatId: "chat",
          metadata: { workspaceOperation: receipt, threadId: "thread" },
        }),
      }),
    );
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { id: "m", updatedAt },
      data: {
        parts: [
          parts[0],
          {
            ...parts[1],
            output: { ...parts[1].output, confirmation: receipt },
          },
        ],
      },
    });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          chat: { emailAccountId: "a", deletedAt: null },
          metadata: { path: ["workspaceReviewKeys"], array_contains: [key] },
        },
      }),
    );
  });
});
