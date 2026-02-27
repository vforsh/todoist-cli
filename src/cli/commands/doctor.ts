import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { Command } from "commander";
import { loadStoredConfig, resolveConfigPath, resolveEffectiveConfig } from "../../core/config.ts";
import { detectOutputMode } from "../../core/output.ts";
import { TodoistClient } from "../../core/todoist.ts";

type CheckStatus = "OK" | "WARN" | "FAIL";

type CheckResult = {
  name: string;
  status: CheckStatus;
  hint?: string;
};

export function createDoctorCommand(): Command {
  const command = new Command("doctor").alias("check").description("Run readiness checks");

  command.action(async () => {
    const globals = command.optsWithGlobals() as { json?: boolean; plain?: boolean };
    const mode = detectOutputMode(globals);

    const checks: CheckResult[] = [];

    checks.push({
      name: "bun_runtime",
      status: process.versions.bun ? "OK" : "FAIL",
      hint: process.versions.bun ? undefined : "Install Bun runtime"
    });

    const configPath = resolveConfigPath();
    const configDir = dirname(configPath);
    const parentDir = dirname(configDir);
    try {
      if (existsSync(configDir)) {
        await access(configDir);
      } else {
        await access(parentDir);
      }
      checks.push({ name: "config_directory_access", status: "OK" });
    } catch {
      checks.push({ name: "config_directory_access", status: "FAIL", hint: `Cannot access ${configDir} or ${parentDir}` });
    }

    let effective;
    try {
      const stored = await loadStoredConfig();
      effective = resolveEffectiveConfig(stored);
      checks.push({ name: "config_validation", status: "OK" });
    } catch (error) {
      checks.push({
        name: "config_validation",
        status: "FAIL",
        hint: error instanceof Error ? error.message : "Invalid config"
      });
    }

    if (!effective?.apiToken) {
      checks.push({ name: "auth_token", status: "FAIL", hint: "Set TODOIST_API_TOKEN or todoist cfg set apiToken -" });
    } else {
      checks.push({ name: "auth_token", status: "OK" });
    }

    if (effective?.apiToken) {
      try {
        const client = new TodoistClient(effective);
        await client.checkReachability();
        checks.push({ name: "endpoint_reachability", status: "OK" });
      } catch (error) {
        checks.push({
          name: "endpoint_reachability",
          status: "FAIL",
          hint: error instanceof Error ? error.message : "Endpoint check failed"
        });
      }
    } else {
      checks.push({ name: "endpoint_reachability", status: "WARN", hint: "Skipped (missing auth token)" });
    }

    const hasFail = checks.some((item) => item.status === "FAIL");
    const overall = hasFail ? "fail" : checks.some((item) => item.status === "WARN") ? "warn" : "ok";

    if (mode === "json") {
      console.log(JSON.stringify({ status: overall, checks }));
    } else if (mode === "plain") {
      for (const check of checks) {
        console.log(`${check.name}\t${check.status}\t${check.hint ?? ""}`.trimEnd());
      }
    } else {
      for (const check of checks) {
        console.error(`${check.status} ${check.name}${check.hint ? ` - ${check.hint}` : ""}`);
      }
      console.log(`status=${overall}`);
    }

    process.exitCode = hasFail ? 1 : 0;
  });

  return command;
}
