import {
  hasAppleOauthConfig,
  hasGoogleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";

export type LoginProvider = "google" | "microsoft" | "apple" | "sso";

export function getEnabledLoginProviders(
  inputs: {
    hasGoogleConfig?: boolean;
    hasMicrosoftConfig?: boolean;
    hasAppleConfig?: boolean;
    ssoLoginEnabled?: boolean;
  } = {},
): ReadonlySet<LoginProvider> {
  const {
    hasGoogleConfig = hasGoogleOauthConfig(),
    hasMicrosoftConfig = hasMicrosoftOauthConfig(),
    hasAppleConfig = hasAppleOauthConfig(),
    ssoLoginEnabled = false,
  } = inputs;

  const enabled = new Set<LoginProvider>();

  if (hasGoogleConfig) {
    enabled.add("google");
  }
  if (hasMicrosoftConfig) {
    enabled.add("microsoft");
  }
  if (hasAppleConfig) {
    enabled.add("apple");
  }

  return enabled;
}
