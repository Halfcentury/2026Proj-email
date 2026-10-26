import { beforeEach, describe, it, expect, vi } from "vitest";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getEmailAccount } from "@/__tests__/helpers";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/utils/llms/index", () => ({ createGenerateObject: () => generate }));
vi.mock("@/utils/llms/use-cases", () => ({
  getModelForUseCase: () => ({}),
  LlmUseCase: { DraftReply: "draft" },
}));
beforeEach(() => vi.clearAllMocks());
describe("unconfirmed business facts", () => {
  it("downgrades a high model confidence when facts still require confirmation", async () => {
    generate.mockResolvedValue({
      object: {
        reply: "[请确认费用及预订状态]",
        confidence: "HIGH",
        missingInformation: ["费用及预订状态"],
      },
    });
    const result = await aiDraftReplyWithConfidence({
      messages: [
        {
          id: "mail",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "预订",
          content: "费用是500元且已预订周五吗？",
        },
      ],
      emailAccount: getEmailAccount(),
      knowledgeBaseContent: null,
      emailHistorySummary: null,
      replyInstructions: "本次先确认事实",
    });
    expect(result.confidence).toBe(DraftReplyConfidence.ALL_EMAILS);
    expect(result.missingInformation).toEqual(["费用及预订状态"]);
    expect(generate.mock.calls[0][0].instructions).toContain("do not guess");
    expect(generate.mock.calls[0][0].prompt).toContain("本次先确认事实");
  });
});
