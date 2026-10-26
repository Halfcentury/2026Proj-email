import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendHtmlEmail } from "./send-html";
import { sendComposeDraft } from "./compose-draft";
import type { EmailProvider } from "./types";
import { createTestLogger } from "@/__tests__/helpers";
vi.mock("./compose-draft", () => ({ sendComposeDraft: vi.fn() }));
describe("personal mail delivery", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends HTML through the provider while stripping historical read-receipt pixels", async () => {
    const sendEmailWithHtml = vi
      .fn()
      .mockResolvedValue({ messageId: "sent-1", threadId: "thread-1" });
    const emailProvider = { sendEmailWithHtml } as unknown as EmailProvider;
    const result = await sendHtmlEmail({
      emailProvider,
      emailAccountId: "account",
      logger: createTestLogger(),
      email: {
        to: "recipient@example.com",
        subject: "Test",
        messageHtml:
          '<p>Body</p><img src="https://example.com/t/abcdefghijklmnopqrstuvwxyz123456" />',
      },
    });
    expect(result.messageId).toBe("sent-1");
    expect(sendEmailWithHtml).toHaveBeenCalledWith(
      expect.objectContaining({ messageHtml: "<p>Body</p>" }),
    );
  });
  it("preserves sending an existing provider draft", async () => {
    const sendEmailWithHtml = vi.fn();
    const provider = { sendEmailWithHtml } as unknown as EmailProvider;
    vi.mocked(sendComposeDraft).mockResolvedValue({
      messageId: "sent-draft",
      threadId: "thread-1",
    });
    await sendHtmlEmail({
      emailProvider: provider,
      emailAccountId: "account",
      logger: createTestLogger(),
      email: {
        to: "recipient@example.com",
        subject: "Test",
        messageHtml: "<p>Draft</p>",
        providerDraftId: "draft-1",
      },
    });
    expect(sendComposeDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1", provider }),
    );
    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });
});
