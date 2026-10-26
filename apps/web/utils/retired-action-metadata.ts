const GENERIC_INTEGRATION_ACTION_LABEL = "已移除的集成操作";
type IntegrationKey = string;
export type IntegrationArgOption = {
  value: string; // stored in Action.integrationArgs
  label: string; // shown in the rule editor
  payloadValue?: string; // sent to the tool; omitted from the payload when absent
};

export type IntegrationArgControl =
  | { type: "text" }
  | { type: "select"; options: readonly IntegrationArgOption[] }
  // Options come from the integration itself: the control names the MCP read
  // tool to call and how to read its response, so no caller needs to know
  // which integration it is talking to.
  | {
      type: "remote-select";
      optionsTool: string; // MCP read tool supplying the options (not the spec's write tool)
      parseOptions: (content: unknown) => IntegrationArgOption[];
      fallbackOptions?: readonly IntegrationArgOption[]; // always offered, even if the fetch fails
    };

export type IntegrationArgSpec = {
  key: string; // key inside Action.integrationArgs
  label: string;
  control: IntegrationArgControl;
  placeholder?: string; // plain-English description of what the AI will write
  aiPrompt?: string; // set => this arg can be filled by the AI at execution time
  aiValue?: string; // select-only: the stored option value meaning "AI decides"
  defaultValue?: string;
  defaultDisplayValue?: string;
  displayValueKey?: string; // companion key holding a human label; never sent to the tool
  required?: boolean; // must resolve to a non-empty value at execution time
  llmDescription?: string; // set => the rule-writing LLM may set this arg
};

export type IntegrationToolSpec = {
  integration: IntegrationKey;
  tool: string;
  actionLabel: string;
  displayArgKey?: string;
  llmDescription: string; // describes the action to the rule-writing LLM
  args: readonly IntegrationArgSpec[];
  buildPayload: (resolved: Record<string, string>) => Record<string, unknown>;
};

export const INTEGRATION_TOOL_SPECS: readonly IntegrationToolSpec[] = [];
export function getIntegrationToolSpec(
  ..._args: unknown[]
): IntegrationToolSpec | undefined {
  return;
}

export function getOnlyIntegrationToolSpec(): IntegrationToolSpec | undefined {
  return;
}

export function getIntegrationActionLabel(action?: {
  integrationName?: string | null;
  integrationToolName?: string | null;
}): string {
  // Only guess when the action names no tool at all. An action that names an
  // unknown tool must not borrow another integration's label, or previews and
  // history would describe the wrong action.
  const namesTool = !!action?.integrationName || !!action?.integrationToolName;
  const spec = namesTool
    ? getIntegrationToolSpec(
        action?.integrationName,
        action?.integrationToolName,
      )
    : getOnlyIntegrationToolSpec();

  return spec?.actionLabel ?? GENERIC_INTEGRATION_ACTION_LABEL;
}

export function getIntegrationActionDisplayValue(action: {
  integrationName?: string | null;
  integrationToolName?: string | null;
  integrationArgs?: unknown;
}): string | null {
  const namesTool = !!action.integrationName || !!action.integrationToolName;
  const spec = namesTool
    ? getIntegrationToolSpec(action.integrationName, action.integrationToolName)
    : getOnlyIntegrationToolSpec();
  if (!spec?.displayArgKey) return null;

  const args = action.integrationArgs;
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;

  const value = (args as Record<string, unknown>)[spec.displayArgKey];
  return typeof value === "string" ? value.trim() || null : null;
}

/** Read tools the app calls directly to populate a remote-select. */
export function getIntegrationRemoteSelectTools(integration: string): string[] {
  return INTEGRATION_TOOL_SPECS.filter(
    (spec) => spec.integration === integration,
  ).flatMap((spec) =>
    spec.args.flatMap((arg) =>
      arg.control.type === "remote-select" ? [arg.control.optionsTool] : [],
    ),
  );
}

/** Resolves a remote-select arg from untrusted request parameters. */
export function getRemoteSelectArg({
  integration,
  tool,
  argKey,
}: {
  integration: string | null | undefined;
  tool: string | null | undefined;
  argKey: string | null | undefined;
}) {
  const spec = getIntegrationToolSpec(integration, tool);
  if (!spec) return;

  const arg = spec.args.find((candidate) => candidate.key === argKey);
  if (arg?.control.type !== "remote-select") return;

  return { spec, control: arg.control };
}

/**
 * Whether the AI fills this arg at execution time: an empty text arg, or a
 * select sitting on its "AI decides" option.
 */
export function isAiFilledArgValue(
  arg: IntegrationArgSpec | undefined,
  value: string | null | undefined,
): boolean {
  if (!arg?.aiPrompt) return false;

  const trimmed = value?.trim() ?? "";
  if (arg.control.type === "select") return trimmed === arg.aiValue;
  return trimmed === "";
}

/** Args a newly added action starts with, per the spec's declared defaults. */
export function buildDefaultIntegrationArgs(
  spec: IntegrationToolSpec,
): Record<string, string> {
  const args: Record<string, string> = {};

  for (const arg of spec.args) {
    if (arg.defaultValue !== undefined) args[arg.key] = arg.defaultValue;
    if (arg.displayValueKey && arg.defaultDisplayValue !== undefined) {
      args[arg.displayValueKey] = arg.defaultDisplayValue;
    }
  }

  return args;
}

/**
 * Maps a loosely-specified select value (e.g. "in 7 days" from an AI-authored
 * rule) onto the option value we store, so the editor can show the choice.
 */
export function normalizeSelectArgValue(
  arg: IntegrationArgSpec,
  value: string | null | undefined,
): string | undefined {
  if (arg.control.type !== "select") return value?.trim() || undefined;

  const trimmed = value?.trim() ?? "";
  if (!trimmed) return arg.defaultValue;

  const match = arg.control.options.find(
    (option) => option.value === trimmed || option.payloadValue === trimmed,
  );
  return match?.value ?? trimmed;
}

/** A select value guaranteed to match one of the arg's options. */
export function getSelectArgOptionLabel(
  arg: IntegrationArgSpec,
  value: string | null | undefined,
): string | undefined {
  if (arg.control.type !== "select") return;
  const trimmed = value?.trim();
  if (!trimmed) return;
  // A value outside the presets is a custom value (e.g. a due date the user or
  // the AI wrote); show it as-is rather than hiding it behind a preset label.
  return (
    arg.control.options.find((option) => option.value === trimmed)?.label ??
    trimmed
  );
}

/** Keys the spec owns, including display-only companions. */
export function getIntegrationArgKeys(spec: IntegrationToolSpec): string[] {
  return spec.args.flatMap((arg) =>
    arg.displayValueKey ? [arg.key, arg.displayValueKey] : [arg.key],
  );
}

/** Reads Todoist's `find-projects` response into selectable options. */

function extractTodoistProjectArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  if ("results" in parsed && Array.isArray(parsed.results)) {
    return parsed.results;
  }
  if ("projects" in parsed && Array.isArray(parsed.projects)) {
    return parsed.projects;
  }
  return [];
}
