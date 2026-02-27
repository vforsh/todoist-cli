import { describe, expect, test } from "bun:test";
import { parseSetAssignments } from "../src/core/kv.ts";
import { resolveConfigPath } from "../src/core/config.ts";
import { parseReminderValue } from "../src/core/todoist.ts";

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

describe("parseReminderValue", () => {
  test("parses numeric reminder as relative minutes", () => {
    expect(parseReminderValue("30")).toEqual({
      item_id: "",
      type: "relative",
      minute_offset: 30
    });
  });

  test("parses non-numeric reminder as absolute date string", () => {
    expect(parseReminderValue("2026-03-01T09:00:00Z")).toEqual({
      item_id: "",
      type: "absolute",
      due: { date: "2026-03-01T09:00:00Z" }
    });
  });
});
