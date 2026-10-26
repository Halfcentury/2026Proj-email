// No connection, credential, OAuth, or transport code is retained for removed integrations.
export type IntegrationKey = string;
export const MCP_INTEGRATIONS: Record<
  string,
  {
    ruleActionWriteTools?: string[];
    name: string;
    displayName: string;
    url: string;
    comingSoon?: boolean;
    shortName?: string;
  }
> = {};
export function getIntegration(
  ..._args: unknown[]
): (typeof MCP_INTEGRATIONS)[string] | undefined {
  return;
}
export const findIntegration = getIntegration;
export const isIntegrationActionGloballyEnabled = () => false;
export async function isIntegrationActionEnabledForUserId(..._args: unknown[]) {
  return false;
}
export async function isIntegrationActionEnabledForEmailAccountId(
  ..._args: unknown[]
) {
  return false;
}
export const INTEGRATION_ACTION_FEATURE_FLAG = "removed-integration-actions";
export async function createMcpToolsForAgent(..._args: unknown[]) {
  return { tools: {}, cleanup: async () => {} };
}
export async function mcpAgent(..._args: unknown[]) {
  return { response: null, getToolCalls: () => [] };
}
