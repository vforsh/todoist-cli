import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../src/cli/program.ts";

const envKeys = [
  "XDG_CONFIG_HOME", "TODOIST_API_TOKEN", "TODOIST_ENDPOINT", "TODOIST_TIMEOUT", "TODOIST_RETRIES"
] as const;

const task = {
  id: "123",
  content: "Buy milk",
  description: "Existing description",
  project_id: "456",
  is_completed: false,
  url: "https://example.invalid/task/123"
};

describe("task descriptions", () => {
  let configDir: string;
  let savedEnv: Record<string, string | undefined>;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    configDir = await mkdtemp(join(tmpdir(), "todoist-test-"));
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.TODOIST_API_TOKEN = "test-token";
    process.env.TODOIST_ENDPOINT = "https://example.invalid";
    process.env.TODOIST_TIMEOUT = "1000";
    process.env.TODOIST_RETRIES = "0";
    const mockFetch = async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return Response.json({ ...task, ...body });
    };
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(mockFetch, { preconnect: () => {} })
    );
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    logSpy.mockRestore();
    for (const key of envKeys) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(configDir, { recursive: true, force: true });
  });

  async function run(args: string[]) {
    await buildProgram().exitOverride().parseAsync(args, { from: "user" });
  }

  function expectRequest(path: string, body: Record<string, unknown>) {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`https://example.invalid${path}`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(body);
  }

  test("creates a task with its exact description and preserves JSON output", async () => {
    const description = "  Milk details\n**Овсяное**  ";
    await run(["task", "add", "Buy milk", "--description", description, "--json"]);
    expectRequest("/api/v1/tasks", { content: "Buy milk", description });
    expect(logSpy.mock.calls).toEqual([[JSON.stringify({ data: { task: { ...task, description } } })]]);
  });

  test("replaces a description without requiring other updates and preserves plain output", async () => {
    await run(["task", "update", "123", "--description", "Replacement", "--plain"]);
    expectRequest("/api/v1/tasks/123", { description: "Replacement" });
    expect(logSpy.mock.calls).toEqual([["123"]]);
  });

  test("clears a description using an explicitly empty string", async () => {
    await run(["task", "update", "123", "--description", "", "--json"]);
    expectRequest("/api/v1/tasks/123", { description: "" });
    expect(JSON.parse(logSpy.mock.calls[0]![0]).data.task.description).toBe("");
  });

  test("omits description when creating without the option", async () => {
    await run(["task", "add", "Buy milk", "--priority", "4"]);
    expectRequest("/api/v1/tasks", { content: "Buy milk", priority: 4 });
    expect(logSpy.mock.calls).toEqual([[JSON.stringify({ task: { ...task, priority: 4 } }, null, 2)]]);
  });

  test("preserves the existing description when updating without the option", async () => {
    await run(["task", "update", "123", "--content", "Buy bread", "--json"]);
    expectRequest("/api/v1/tasks/123", { content: "Buy bread" });
    expect(JSON.parse(logSpy.mock.calls[0]![0]).data.task.description).toBe(task.description);
  });

  test("still rejects updates without any options", async () => {
    await expect(run(["task", "update", "123"])).rejects.toThrow("No updates provided");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("documents the option in add and update help", () => {
    const taskCommand = buildProgram().commands.find((command) => command.name() === "task")!;
    for (const name of ["add", "update"]) {
      const help = taskCommand.commands.find((command) => command.name() === name)!.helpInformation();
      expect(help).toContain("--description <description>");
      if (name === "update") expect(help).toContain('use "" to clear');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
