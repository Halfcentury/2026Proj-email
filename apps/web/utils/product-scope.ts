/** This distribution includes only the personal mail assistant. */
export const COURSE_MODE = true;
export function getProductFeatures(_courseMode?: boolean) {
  return {
    desktop: false,
    organizations: false,
    billing: false,
    messaging: false,
    marketing: false,

    integrations: false,
  };
}
export const PRODUCT_FEATURES = getProductFeatures();

const removedPages = new Set([
  "onboarding-brief",
  "early-access",
  "license",
  "refer",
  "welcome",
  "organization",
  "organizations",
  "shared",
  "premium",
  "pricing",
  "channels",
  "stats",
  "usage",
  "integrations",
  "desktop",
  "enterprise",
  "home",
  "app",
  "oss-friends",
  "feature-requests",
  "referrals",
  "welcome-upgrade",
  "thank-you",
]);

// These routes belong only to removed workflows. Mail sender/newsletter queries
// are retained because bulk mail operations also use them.
const removedApiPrefixes = [
  "/api/mcp",
  "/api/automation-jobs",
  "/api/organizations",
  "/api/org",
  "/api/shared",
  "/api/team-comments",
  "/api/user/sent-message-opens",
  "/api/stripe",
  "/api/lemon",
  "/api/lemon-squeezy",
  "/api/user/organization-membership",
  "/api/apple/subscription",
  "/api/referrals",
  "/api/slack",
  "/api/telegram",
  "/api/teams",
  "/api/sso",
  "/api/auth/sso",
  "/api/auth/scim",
  "/api/auth/admin",
  "/api/desktop",
  "/api/user/messaging-channels",
  "/api/user/usage",
  "/api/user/stats/response-time",
  "/api/user/stats/rule-stats",
  "/api/v1/stats",
  "/api/integrations",
  "/api/user/integrations",
  "/api/mcp/integrations",
  "/api/tracking",
  "/ingest",
  "/_proxy/dub",
];

function isWithin(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Shared by navigation and the request boundary, including old bookmarked URLs. */
export function isProductPathEnabled(
  pathname: string,
  courseMode = COURSE_MODE,
) {
  let path: string;
  try {
    path =
      decodeURIComponent(pathname.split(/[?#]/, 1)[0]).replace(/\/+$/, "") ||
      "/";
  } catch {
    return false;
  }
  if (removedApiPrefixes.some((prefix) => isWithin(path, prefix))) return false;
  if (path.startsWith("/api/")) return true;
  if (
    isWithin(path, "/login/sso") ||
    isWithin(path, "/login/desktop-update-required")
  )
    return false;
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "book") return true;
  return !removedPages.has(segments[0]) && !removedPages.has(segments[1]);
}

const removedActions = new Set([
  "shareConversation",
  "postConversationComment",
  "deleteConversationComment",
  "setConversationParticipantAccess",
  "stopConversationSharing",
  "markConversationRead",
  "setConversationMuted",
  "updateReferralSignature",
  "updateSentWithSignature",
  "updateSyncToExtension",
  "updateSentMessageOpenTracking",
  "resetAnalytics",
  "createOrganization",
  "inviteMembers",
  "handleInvitation",
  "removeMember",
  "updateMemberRole",
  "transferOwnership",
  "cancelInvitation",
  "updateAnalyticsConsent",
  "createOrganizationAndInvite",
  "createOrganizationRule",
  "updateOrganizationRule",
  "deleteOrganizationRule",
  "setOrganizationRuleEnabled",
  "setMemberOrganizationRuleEnabled",
  "registerSSOProvider",
  "updateMultiAccountPremium",
  "switchLemonPremiumPlan",
  "activateLicenseKey",
  "adminChangePremiumStatus",
  "claimPremiumAdmin",
  "updateStripeInvoiceEmails",
  "getBillingPortalUrl",
  "endStripeTrial",
  "generateCheckoutSession",
  "updateSlackRoute",
  "updateMessagingFeatureRoute",
  "disconnectChannel",
  "linkSlackWorkspace",
  "createMessagingLinkCode",
  "toggleRuleChannel",
]);

export function isProductActionEnabled(name: string, courseMode = COURSE_MODE) {
  return !removedActions.has(name);
}
