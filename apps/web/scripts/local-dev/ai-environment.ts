import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const LOCAL_AI_ENVIRONMENT_KEYS = [
  "ASSISTANT_BASE_URL",
  "ASSISTANT_MODEL",
  "ASSISTANT_API_KEY",
] as const;

/**
 * Load an optional real OpenAI-compatible model for the regular AI features
 * (assistant chat included), keeping every other credential out of scope.
 * Without these values the local launcher keeps using the bundled emulator.
 */
export function readLocalAiEnvironment(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values = parse(readFileSync(path, "utf8"));
  return Object.fromEntries(
    LOCAL_AI_ENVIRONMENT_KEYS.flatMap((key) =>
      values[key] ? [[key, values[key]]] : [],
    ),
  );
}
