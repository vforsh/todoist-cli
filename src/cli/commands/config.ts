import { Command } from "commander";
import {
  isSecretKey,
  loadStoredConfig,
  redactConfig,
  resolveConfigPath,
  resolveEffectiveConfig,
  saveStoredConfig
} from "../../core/config.ts";
import { parseSetAssignments } from "../../core/kv.ts";
import { detectOutputMode, printData } from "../../core/output.ts";
import { CliError } from "../../lib/errors.ts";
import { readAllStdin, readStdinTrimmed } from "../../lib/io.ts";

const allowedKeys = new Set(["endpoint", "apiToken", "timeout", "retries"]);

type ConfigValue = string | number | undefined;

function coerceValue(key: string, value: string): ConfigValue {
  if (key === "timeout" || key === "retries") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new CliError(`Invalid numeric value for ${key}: ${value}`, 2);
    }
    return numberValue;
  }

  return value;
}

export function createConfigCommand(): Command {
  const command = new Command("config").alias("cfg").description("Manage CLI configuration");

  command
    .command("list")
    .alias("ls")
    .description("List effective configuration")
    .action(async () => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const stored = await loadStoredConfig();
      const effective = resolveEffectiveConfig(stored);
      const data = {
        path: resolveConfigPath(),
        stored: redactConfig(stored),
        effective: redactConfig(effective)
      };
      printData(mode, data, [`path=${data.path}`]);
    });

  command
    .command("path")
    .description("Print config file path")
    .action(() => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const path = resolveConfigPath();
      printData(mode, { path }, [path]);
    });

  command
    .command("get")
    .description("Get one or more effective config keys")
    .argument("<keys...>")
    .action(async (keys: string[]) => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const stored = await loadStoredConfig();
      const effective = resolveEffectiveConfig(stored) as Record<string, ConfigValue>;
      const data: Record<string, ConfigValue> = {};

      for (const key of keys) {
        if (!allowedKeys.has(key)) {
          throw new CliError(`Unsupported key: ${key}`, 2);
        }
        const value = effective[key];
        data[key] = isSecretKey(key) && value ? "***redacted***" : value;
      }

      const plain = keys.map((key) => `${key}=${String(data[key] ?? "")}`);
      printData(mode, data, plain);
    });

  command
    .command("set")
    .description("Set config values: key value OR key=value key=value")
    .argument("<values...>")
    .action(async (values: string[]) => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const stored = await loadStoredConfig();
      const updates: Record<string, ConfigValue> = {};

      if (values.length === 2 && !values[0]?.includes("=")) {
        const [key, rawValue] = values;
        if (!key || rawValue === undefined) {
          throw new CliError("Expected: todoist cfg set <key> <value>", 2);
        }
        if (!allowedKeys.has(key)) {
          throw new CliError(`Unsupported key: ${key}`, 2);
        }

        if (isSecretKey(key)) {
          if (rawValue !== "-") {
            throw new CliError(`Refusing secret in argv for key ${key}. Use stdin: printf 'token' | todoist cfg set ${key} -`, 2);
          }
          updates[key] = await readStdinTrimmed();
        } else {
          updates[key] = coerceValue(key, rawValue);
        }
      } else {
        const assignments = parseSetAssignments(values);
        for (const [key, rawValue] of Object.entries(assignments)) {
          if (!allowedKeys.has(key)) {
            throw new CliError(`Unsupported key: ${key}`, 2);
          }
          if (isSecretKey(key)) {
            throw new CliError(`Secret key ${key} must be set via stdin and '-' placeholder`, 2);
          }
          updates[key] = coerceValue(key, rawValue);
        }
      }

      const next = {
        ...stored,
        ...updates
      };
      await saveStoredConfig(next);
      printData(mode, { updated: Object.keys(updates) }, Object.keys(updates));
    });

  command
    .command("unset")
    .description("Unset one or more keys")
    .argument("<keys...>")
    .action(async (keys: string[]) => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const stored = await loadStoredConfig();
      for (const key of keys) {
        if (!allowedKeys.has(key)) {
          throw new CliError(`Unsupported key: ${key}`, 2);
        }
        delete (stored as Record<string, unknown>)[key];
      }
      await saveStoredConfig(stored);
      printData(mode, { unset: keys }, keys);
    });

  command
    .command("import")
    .description("Import config from stdin JSON payload")
    .requiredOption("--json", "Read JSON payload from stdin")
    .action(async () => {
      const parentOpts = command.optsWithGlobals();
      const mode = detectOutputMode(parentOpts);
      const raw = await readAllStdin();
      if (!raw.trim()) {
        throw new CliError("No JSON input provided on stdin", 2);
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, ConfigValue> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!allowedKeys.has(key)) {
          throw new CliError(`Unsupported key in import: ${key}`, 2);
        }
        if (isSecretKey(key)) {
          throw new CliError(`Refusing secret import for key ${key}. Use stdin secret set command instead.`, 2);
        }
        if (value === undefined || value === null) {
          continue;
        }
        next[key] = typeof value === "number" ? value : coerceValue(key, String(value));
      }

      await saveStoredConfig(next);
      printData(mode, { imported: Object.keys(next) }, Object.keys(next));
    });

  command
    .command("export")
    .description("Export effective config")
    .requiredOption("--json", "Output JSON")
    .action(async () => {
      const stored = await loadStoredConfig();
      const effective = resolveEffectiveConfig(stored);
      console.log(JSON.stringify(effective));
    });

  return command;
}
