import type { LoginProvider } from "@/utils/oauth/login-providers";
export type AuthFunnelProvider = LoginProvider | "unknown";
export function normalizeAuthProvider(value: unknown): AuthFunnelProvider {
  switch (value) {
    case "google":
    case "microsoft":
    case "apple":
    case "sso":
      return value;
    default:
      return "unknown";
  }
}

export function getAuthErrorCategory(errorCode?: string | null) {
  switch (errorCode?.toLowerCase()) {
    case "access_denied":
      return "access_denied";
    case "invalid_code":
    case "no_code":
    case "org_invite_invalid_code":
      return "invalid_or_expired_callback";
    case "email_already_linked":
    case "oauth_account_not_linked":
    case "account_not_linked":
    case "account_already_linked_to_different_user":
      return "account_conflict";
    case "requiresreconsent":
      return "reconsent_required";
    case "email_not_found":
    case "signup_not_allowed":
      return "signup_not_allowed";
    case "network_error":
      return "network_error";
    case "client_error":
      return "client_error";
    case "internal_server_error":
    case "oauth_provider_not_found":
    case "unable_to_create_user":
    case "unable_to_get_user_info":
    case "unable_to_link_account":
    case "sso_start_rejected":
      return "provider_or_server_error";
    default:
      return "unknown";
  }
}

export function getPendingAuthProvider() {
  return "unknown" as AuthFunnelProvider;
}
