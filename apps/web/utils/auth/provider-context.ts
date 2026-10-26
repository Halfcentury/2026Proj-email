import type { GenericEndpointContext } from "better-auth";
export function getAuthProviderFromContext(
  context: Pick<GenericEndpointContext, "params" | "path"> | null,
) {
  const provider = context?.params?.id ?? context?.params?.providerId;
  return provider === "google" ||
    provider === "microsoft" ||
    provider === "apple"
    ? provider
    : "unknown";
}
