import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import {
  collectIncomingAttachmentContext,
  readEmailAttachment,
} from "./read-email-attachment";
const logger = createTestLogger();
const attachment = {
  attachmentId: "a",
  filename: "报价.csv",
  mimeType: "text/csv",
  size: 50,
};
const message = getMockParsedMessage({
  id: "m",
  threadId: "t",
  attachments: [attachment],
});
describe("owned incoming attachment evidence", () => {
  it("passes actual bytes into context and a locatable source without sending files", async () => {
    const provider = createMockEmailProvider({
      getAttachment: vi.fn().mockResolvedValue({
        data: Buffer.from("产品,价格\nA,120").toString("base64"),
        size: 50,
      }),
    });
    const result = await collectIncomingAttachmentContext({
      emailAccountId: "owned",
      emailProvider: provider,
      message,
      logger,
    });
    expect(result.content).toContain("A,120");
    expect(result.sources[0]).toMatchObject({
      recordId: "a",
      emailAccountId: "owned",
      excerpt: "产品,价格\nA,120",
      href: "/owned/mail?thread-id=t&attachment-id=a",
    });
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });
  it("rejects unknown attachment IDs before downloading", async () => {
    const provider = createMockEmailProvider();
    await expect(
      readEmailAttachment({
        emailProvider: provider,
        message,
        attachmentId: "other",
        logger,
      }),
    ).rejects.toThrow("未找到");
    expect(provider.getAttachment).not.toHaveBeenCalled();
  });
  it("reports unavailable attachments instead of silently grounding replies in them", async () => {
    const provider = createMockEmailProvider({
      getAttachment: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const result = await collectIncomingAttachmentContext({
      emailAccountId: "owned",
      emailProvider: provider,
      message,
      logger,
    });
    expect(result.content).toBeNull();
    expect(result.sources).toHaveLength(0);
    expect(result.issues[0].message).toContain("未参考");
  });
  it("bounds text and reports truncation", async () => {
    const provider = createMockEmailProvider({
      getAttachment: vi.fn().mockResolvedValue({
        data: Buffer.from("x".repeat(9000)).toString("base64"),
        size: 9000,
      }),
    });
    const result = await collectIncomingAttachmentContext({
      emailAccountId: "owned",
      emailProvider: provider,
      message,
      logger,
    });
    expect(result.sources[0].excerpt).toHaveLength(8000);
    expect(result.issues[0].message).toContain("前 8000");
  });
});
