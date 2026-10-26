const features = vi.hoisted(() => ({ organizations: true }));
vi.mock("@/utils/product-scope", () => ({ PRODUCT_FEATURES: features }));
beforeEach(() => {
  features.organizations = true;
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEnabledLoginProviders } from "./login-providers";

const allConfigured = {
  hasGoogleConfig: true,
  hasMicrosoftConfig: true,
  hasAppleConfig: true,
} as const;

describe("getEnabledLoginProviders", () => {
  it("includes configured OAuth providers", () => {
    const result = getEnabledLoginProviders(allConfigured);
    expect(result.has("google")).toBe(true);
    expect(result.has("microsoft")).toBe(true);
    expect(result.has("apple")).toBe(true);
  });

  it("filters out unconfigured OAuth providers", () => {
    const result = getEnabledLoginProviders({
      hasGoogleConfig: false,
      hasMicrosoftConfig: false,
      hasAppleConfig: false,
    });
    expect(result.has("google")).toBe(false);
    expect(result.has("microsoft")).toBe(false);
    expect(result.has("apple")).toBe(false);
  });
});

it("disables enterprise SSO in course mode even when configured", () => {
  features.organizations = false;
  const providers = getEnabledLoginProviders({
    ...allConfigured,
    ssoLoginEnabled: true,
  });
  expect(providers.has("sso")).toBe(false);
  expect(providers.has("google")).toBe(true);
});
