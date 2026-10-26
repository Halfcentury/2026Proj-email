import { describe, it, expect } from "vitest";
import { resolveKnowledgeSources, sourcesForAccount } from "./context-sources";
import { isSafeContextHref } from "./types";
import { localDateTimeToIso } from "@/utils/calendar/local-date-time";
const knowledge = [
  {
    id: "k1",
    title: "交付政策",
    content: "确认付款后，三个工作日内发货。",
    emailAccountId: "a",
  },
  { id: "k2", title: "其他邮箱", content: "机密价格", emailAccountId: "b" },
];
describe("actual scoped evidence", () => {
  it("retains only actual quotes from authorized records", () => {
    const sources = resolveKnowledgeSources({
      emailAccountId: "a",
      knowledge,
      citations: [
        { knowledgeId: "k1", quote: "三个工作日内发货。" },
        { knowledgeId: "k1", quote: "今天已发货" },
        { knowledgeId: "fake", quote: "任何内容" },
        { knowledgeId: "k2", quote: "机密价格" },
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      recordId: "k1",
      excerpt: "三个工作日内发货。",
      emailAccountId: "a",
    });
    expect(
      sourcesForAccount(
        [...sources, { ...sources[0], emailAccountId: "b" }],
        "a",
      ),
    ).toHaveLength(1);
  });
  it.each([
    "javascript:alert(1)",
    "//evil.test",
    "/\\evil.test",
    "http://insecure.test",
  ])("blocks unsafe link %s", (href) =>
    expect(isSafeContextHref(href)).toBe(false));
  it("converts wall time using the selected timezone and rejects nonexistent DST time", () => {
    expect(localDateTimeToIso("2026-11-01T09:00", "Asia/Shanghai")).toBe(
      "2026-11-01T01:00:00.000Z",
    );
    expect(() =>
      localDateTimeToIso("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
  });
});
