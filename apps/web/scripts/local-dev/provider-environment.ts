import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const PROVIDER_ENVIRONMENT_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_PUBSUB_TOPIC_NAME",
  "GOOGLE_PUBSUB_VERIFICATION_TOKEN",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_WEBHOOK_CLIENT_STATE",
] as const;

/**
 * Load real mailbox OAuth credentials for local development. Supplying a
 * provider's client credentials replaces its bundled emulator; leaving them
 * out keeps the demo setup unchanged.
 */
export function readProviderEnvironment(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values = parse(readFileSync(path, "utf8"));
  return Object.fromEntries(
    PROVIDER_ENVIRONMENT_KEYS.flatMap((key) =>
      values[key] ? [[key, values[key]]] : [],
    ),
  );
}
