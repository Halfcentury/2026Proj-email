import { beforeEach, describe, it, expect, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { analyzeEmail, generateReply } from "./service";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
const { generate, match, draft } = vi.hoisted(() => ({
  generate: vi.fn(),
  match: vi.fn(),
  draft: vi.fn(),
}));
vi.mock("@/utils/llms", () => ({ createGenerateObject: () => generate }));
vi.mock("@/utils/llms/use-cases", () => ({
  getModelForUseCase: () => ({}),
  LlmUseCase: { Summarise: "summarise" },
}));
vi.mock("@/utils/ai/choose-rule/match-rules", () => ({
  findMatchingRules: match,
}));
vi.mock("@/utils/reply-tracker/generate-draft", () => ({
  fetchMessagesAndGenerateDraftWithConfidenceThreshold: draft,
}));
const message = getMockParsedMessage({
  id: "mail-1",
  threadId: "thread-1",
  textPlain: "请确认交付日期。",
  textHtml: "<p>请确认交付日期。</p>",
});
const analysis = {
  summary: "对方请求确认交付日期。",
  requests: ["确认交付日期"],
  needsReply: true,
  replyReason: "存在明确问题",
  missingInformation: ["实际交付日期"],
  relatedNeeds: [],
  suggestedActions: [{ type: "reply", reason: "确认后回复" }],
};
function options() {
  return {
    emailAccount: getEmailAccount(),
    emailProvider: createMockEmailProvider({
      getThreadMessages: vi.fn().mockResolvedValue([message]),
    }),
    threadId: "thread-1",
    logger: createTestLogger(),
    record: false,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  generate.mockResolvedValue({ object: analysis });
  match.mockResolvedValue({ matches: [], reasoning: "" });
  prisma.rule.findMany.mockResolvedValue([]);
});
describe("shared email workspace", () => {
  it("analyzes and matches rules without entering mailbox execution", async () => {
    const input = options();
    const result = await analyzeEmail(input);
    expect(result.analysis).toEqual(analysis);
    expect(result.sources[0].excerpt).toContain("请确认交付日期");
    expect(input.emailProvider.archiveThread).not.toHaveBeenCalled();
    expect(input.emailProvider.markReadThread).not.toHaveBeenCalled();
    expect(input.emailProvider.sendEmail).not.toHaveBeenCalled();
    expect(prisma.executedRule.create).not.toHaveBeenCalled();
    expect(prisma.chat.create).not.toHaveBeenCalled();
  });
  it("returns usable analysis with a visible rule lookup failure", async () => {
    prisma.rule.findMany.mockRejectedValue(new Error("offline"));
    const result = await analyzeEmail(options());
    expect(result.status).toBe("partial");
    expect(result.issues[0].source).toBe("规则");
    expect(result.analysis?.needsReply).toBe(true);
  });
  it("uses full RAG with one-time requirements and exact current-message evidence", async () => {
    const input = options();
    const sources = [
      {
        id: "email:mail-1",
        type: "email",
        recordId: "mail-1",
        emailAccountId: input.emailAccount.id,
        title: "当前邮件",
        excerpt: "请确认交付日期。",
        observedAt: new Date().toISOString(),
        href: null,
      },
    ];
    draft.mockResolvedValue({
      draft: "<p>[待确认交付日期]</p>",
      textDraft: "[待确认交付日期]",
      confidence: DraftReplyConfidence.ALL_EMAILS,
      draftContextMetadata: {
        messageId: "mail-1",
        threadId: "thread-1",
        sources,
        missingInformation: ["实际交付日期"],
        issues: [{ source: "日历", message: "查询失败" }],
      },
    });
    const result = await generateReply({ ...input, instructions: "简短回复" });
    expect(draft.mock.calls[0][7]).toEqual({
      replyInstructions: "简短回复",
      bypassCache: true,
    });
    expect(result.sources).toEqual(sources);
    expect(result.status).toBe("partial");
    expect(result.replyInstructions).toBe("简短回复");
  });
  it("rejects a cached draft whose evidence belongs to another mailbox", async () => {
    draft.mockResolvedValue({
      draft: "<p>other</p>",
      confidence: DraftReplyConfidence.ALL_EMAILS,
      draftContextMetadata: {
        messageId: "mail-1",
        threadId: "thread-1",
        sources: [
          {
            id: "x",
            type: "email",
            recordId: "mail-1",
            emailAccountId: "other",
          },
        ],
      },
    });
    await expect(generateReply(options())).rejects.toThrow("原邮件依据");
  });
});
