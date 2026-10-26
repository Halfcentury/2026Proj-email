const scope = vi.hoisted(() => ({ courseMode: false }));
vi.mock("@/utils/product-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/product-scope")>();
  return {
    ...actual,
    get COURSE_MODE() {
      return scope.courseMode;
    },
    isProductPathEnabled: (path: string) =>
      actual.isProductPathEnabled(path, scope.courseMode),
  };
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

beforeEach(() => {
  vi.clearAllMocks();
  scope.courseMode = false;
});

describe("proxy matcher", () => {
  it("covers product requests while leaving Next assets alone", () => {
    expect(matchesProxy("/")).toBe(true);
    expect(matchesProxy("/pricing")).toBe(true);
    expect(matchesProxy("/pricing/")).toBe(true);
    expect(matchesProxy("/about")).toBe(true);
    expect(matchesProxy("/missing-page")).toBe(true);
    expect(matchesProxy("/api/v1/rules")).toBe(true);
    expect(matchesProxy("/_next/static/chunk.js")).toBe(false);
    expect(matchesProxy("/_next/image")).toBe(false);
  });
});

describe("proxy content negotiation", () => {
  it("returns markdown when explicitly preferred", async () => {
    const response = proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { Accept: "text/markdown, text/html;q=0.8" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("vary")).toBe("Accept");
    await expect(response.text()).resolves.toContain("# 十组邮件小助手");
  });

  it("passes browser requests through and advertises negotiation", () => {
    const response = proxy(
      new NextRequest("https://www.getinboxzero.com/login", {
        headers: { Accept: "text/html,application/xhtml+xml" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("never replaces RSC responses with markdown", () => {
    const response = proxy(
      new NextRequest("https://www.getinboxzero.com/", {
        headers: { Accept: "text/markdown", RSC: "1" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("vary")).toBe("Accept");
  });
});

function matchesProxy(url: string) {
  return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
}

describe("course request boundary", () => {
  it("redirects removed pages and rejects writes to removed APIs", async () => {
    scope.courseMode = true;
    const page = proxy(new NextRequest("https://example.com/account/channels"));
    expect(page.headers.get("location")).toBe("https://example.com/mail");
    const api = proxy(
      new NextRequest("https://example.com/api/stripe/webhook", {
        method: "POST",
      }),
    );
    expect(api.status).toBe(404);
    await expect(api.json()).resolves.toEqual({
      error: "此功能不在当前项目范围内",
    });
  });
  it("preserves core callbacks and sends the home page to mail", () => {
    scope.courseMode = true;
    expect(
      proxy(
        new NextRequest("https://example.com/api/auth/callback/google"),
      ).headers.get("x-middleware-next"),
    ).toBe("1");
    expect(
      proxy(new NextRequest("https://example.com/")).headers.get("location"),
    ).toBe("https://example.com/mail");
  });
});
