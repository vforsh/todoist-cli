import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import type { EffectiveConfig, StoredConfig } from "./types.ts";
import { CliError } from "../lib/errors.ts";

const schema = z
  .object({
    endpoint: z.string().url().optional(),
    apiToken: z.string().min(1).optional(),
    timeout: z.number().int().positive().optional(),
    retries: z.number().int().min(0).max(10).optional()
  });

const DEFAULTS: EffectiveConfig = {
  endpoint: "https://api.todoist.com",
  timeout: 15000,
  retries: 2
};

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const configRoot = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configRoot, "todoist", "config.json");
}

export async function loadStoredConfig(configPath = resolveConfigPath()): Promise<StoredConfig> {
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(`Config file is not valid JSON: ${configPath}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new CliError(`Config validation failed: ${result.error.issues[0]?.message ?? "invalid value"}`);
  }

  return result.data;
}

export async function saveStoredConfig(config: StoredConfig, configPath = resolveConfigPath()): Promise<void> {
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new CliError(`Cannot save config: ${result.error.issues[0]?.message ?? "invalid value"}`);
  }

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
}

export function resolveEffectiveConfig(stored: StoredConfig, env: NodeJS.ProcessEnv = process.env): EffectiveConfig {
  const envTimeout = env.TODOIST_TIMEOUT ? Number(env.TODOIST_TIMEOUT) : undefined;
  const envRetries = env.TODOIST_RETRIES ? Number(env.TODOIST_RETRIES) : undefined;

  const merged: EffectiveConfig = {
    endpoint: env.TODOIST_ENDPOINT || stored.endpoint || DEFAULTS.endpoint,
    apiToken: env.TODOIST_API_TOKEN || stored.apiToken,
    timeout: envTimeout ?? stored.timeout ?? DEFAULTS.timeout,
    retries: envRetries ?? stored.retries ?? DEFAULTS.retries
  };

  const result = schema.safeParse(merged);
  if (!result.success) {
    throw new CliError(`Effective config is invalid: ${result.error.issues[0]?.message ?? "invalid value"}`);
  }

  return result.data as EffectiveConfig;
}

export function redactConfig(config: StoredConfig | EffectiveConfig): Record<string, string | number | undefined> {
  return {
    endpoint: config.endpoint,
    apiToken: config.apiToken ? "***redacted***" : undefined,
    timeout: config.timeout,
    retries: config.retries
  };
}

export function isSecretKey(key: string): boolean {
  return /token|secret|api[_-]?key/i.test(key);
}
