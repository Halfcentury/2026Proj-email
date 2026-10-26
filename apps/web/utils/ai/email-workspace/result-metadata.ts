import { emailWorkspaceResultSchema, type EmailWorkspaceResult } from "./types";

/** Only completed outputs from the two shared services become workspace records. */
export function workspaceResultsFromParts(
  parts: unknown,
): EmailWorkspaceResult[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part) => {
    if (
      !part ||
      (part.type !== "tool-analyzeEmail" &&
        part.type !== "tool-generateReply") ||
      part.state !== "output-available"
    )
      return [];
    const parsed = emailWorkspaceResultSchema.safeParse(part.output);
    return parsed.success ? [parsed.data] : [];
  });
}
