import type { Command } from "commander";
import { loadStoredConfig, resolveEffectiveConfig } from "../core/config.ts";
import { detectOutputMode } from "../core/output.ts";
import { TodoistClient } from "../core/todoist.ts";

export async function createCommandContext(command: Command) {
  const globals = command.optsWithGlobals() as Record<string, string | boolean | undefined>;
  const stored = await loadStoredConfig();
  const base = resolveEffectiveConfig(stored);
  const cfg = {
    ...base,
    endpoint: typeof globals.endpoint === "string" ? globals.endpoint : base.endpoint,
    timeout: typeof globals.timeout === "string" ? Number(globals.timeout) : base.timeout,
    retries: typeof globals.retries === "string" ? Number(globals.retries) : base.retries
  };
  return {
    client: new TodoistClient(cfg),
    mode: detectOutputMode({ json: Boolean(globals.json), plain: Boolean(globals.plain) })
  };
}
