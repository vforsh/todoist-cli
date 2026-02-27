import { describe, expect, test } from "bun:test";
import { parseSetAssignments } from "../src/core/kv.ts";
import { resolveConfigPath } from "../src/core/config.ts";

describe("resolveConfigPath", () => {
  test("uses XDG_CONFIG_HOME when present", () => {
    const path = resolveConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg" } as NodeJS.ProcessEnv);
    expect(path).toBe("/tmp/xdg/todoist/config.json");
  });
});

describe("parseSetAssignments", () => {
  test("parses key=value inputs", () => {
    expect(parseSetAssignments(["endpoint=https://api.todoist.com", "retries=3"])).toEqual({
      endpoint: "https://api.todoist.com",
      retries: "3"
    });
  });
});
