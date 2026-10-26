import { describe, expect, it } from "vitest";
import {
  getProductFeatures,
  isProductActionEnabled,
  isProductPathEnabled,
} from "./product-scope";

describe("personal course scope", () => {
  it("removes all commercial and organization capabilities together", () => {
    expect(
      Object.values(getProductFeatures(true)).every((value) => !value),
    ).toBe(true);
  });

  it.each([
    "/organization/acme",
    "/account/organization/create",
    "/shared/activity",
    "/premium",
    "/pricing",
    "/account/channels",
    "/account/stats?range=30d",
    "/account/usage/",
    "/account/integrations",
    "/login/sso",
    "/desktop",
    "/api/organizations/acme",
    "/api/stripe/webhook",
    "/api/telegram/events",
    "/api/slack/callback",
    "/api/teams/events",
    "/api/user/messaging-channels",
    "/api/auth/scim/v2/Users",
    "/api/sso/signin",
    "/api/referrals/code",
    "/account/%73tats",
    "/api/%73lack/events",
    "/ingest/e",
  ])("disables removed URLs including old bookmarks: %s", (path) => {
    expect(isProductPathEnabled(path, true)).toBe(false);
  });

  it.each([
    "/mail",
    "/account/mail",
    "/account/assistant",
    "/account/automation",
    "/settings",
    "/accounts",
    "/account/calendars",
    "/account/meetings",
    "/account/briefs",
    "/account/drive",
    "/account/mail-triage",
    "/book/stats",
    "/api/auth/callback/google",
    "/api/outlook/callback",
    "/api/google/webhook",
    "/api/calendar/events",
    "/api/recall/webhook",
    "/api/drive/files",
    "/api/cron/scheduled-actions",
    "/api/user/stats/newsletters",
    "/api/user/stats/senders",
  ])("preserves core and supporting paths: %s", (path) => {
    expect(isProductPathEnabled(path, true)).toBe(true);
  });

  it.each([
    "createOrganization",
    "generateCheckoutSession",
    "shareConversation",
    "toggleRuleChannel",
    "registerSSOProvider",
  ])("rejects direct removed actions: %s", (name) => {
    expect(isProductActionEnabled(name, true)).toBe(false);
  });

  it.each([
    "createRule",
    "updateMeetingBriefsEmailDelivery",
    "updateDigestEmailDelivery",
  ])("keeps supporting email actions: %s", (name) => {
    expect(isProductActionEnabled(name, true)).toBe(true);
  });

  it("does not restore removed modules through the former scope toggle", () => {
    expect(isProductPathEnabled("/api/stripe/webhook", false)).toBe(false);
    expect(isProductActionEnabled("createOrganization", false)).toBe(false);
  });
});
