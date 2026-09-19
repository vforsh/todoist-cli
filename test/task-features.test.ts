import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../src/cli/program.ts";

const envKeys = [
  "XDG_CONFIG_HOME", "TODOIST_API_TOKEN", "TODOIST_ENDPOINT", "TODOIST_TIMEOUT", "TODOIST_RETRIES"
] as const;

const baseTask = {
  id: "task-1",
  content: "Ship it",
  description: "Details",
  project_id: "project-1",
  section_id: "section-1",
  parent_id: "parent-1",
  responsible_uid: "42",
  labels: ["release"],
  priority: 2,
  due: { date: "2026-09-20", string: "tomorrow" },
  deadline: { date: "2026-09-30" },
  duration: { amount: 30, unit: "minute" as const },
  checked: false
};

type SeenRequest = { url: URL; method: string; body?: unknown };

describe("task metadata, resource discovery, and show", () => {
  let configDir: string;
  let savedEnv: Record<string, string | undefined>;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;
  let requests: SeenRequest[];
  let handler: (request: SeenRequest) => Response | Promise<Response>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    configDir = await mkdtemp(join(tmpdir(), "todoist-features-"));
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.TODOIST_API_TOKEN = "test-token";
    process.env.TODOIST_ENDPOINT = "https://example.invalid";
    process.env.TODOIST_TIMEOUT = "1000";
    process.env.TODOIST_RETRIES = "0";
    requests = [];
    handler = () => Response.json({});
    const mockFetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = {
        url: new URL(String(input)),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" && init.body ? JSON.parse(init.body) : undefined
      };
      requests.push(request);
      return handler(request);
    };
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(Object.assign(mockFetch, { preconnect: () => {} }));
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

  test("adds every supported field while resolving project and section names", async () => {
    handler = ({ url, body }) => {
      if (url.pathname === "/api/v1/projects") return Response.json({ results: [{ id: "project-1", name: "Work" }] });
      if (url.pathname === "/api/v1/sections") return Response.json({ results: [{ id: "section-1", name: "Release", project_id: "project-1" }] });
      return Response.json({ ...baseTask, ...(body as object) });
    };

    await run([
      "task", "add", "Ship it", "--description", "Details", "--project", "work", "--section", "release",
      "--label", "release", "--label", "urgent", "--due-string", "tomorrow", "--priority", "2",
      "--assignee", "42", "--duration", "30", "--duration-unit", "minute", "--deadline", "2026-09-30", "--json"
    ]);

    expect(requests.map(({ url }) => url.pathname)).toEqual(["/api/v1/projects", "/api/v1/sections", "/api/v1/tasks"]);
    expect(requests[1]!.url.searchParams.get("project_id")).toBe("project-1");
    expect(requests[2]!.body).toEqual({
      content: "Ship it",
      description: "Details",
      project_id: "project-1",
      section_id: "section-1",
      labels: ["release", "urgent"],
      due_string: "tomorrow",
      priority: 2,
      assignee_id: 42,
      duration: 30,
      duration_unit: "minute",
      deadline_date: "2026-09-30"
    });
  });

  test("preserves raw --project-id automation without discovery calls", async () => {
    handler = ({ body }) => Response.json({ ...baseTask, ...(body as object) });
    await run(["task", "add", "Ship it", "--project-id", "raw-project", "--plain"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toEqual({ content: "Ship it", project_id: "raw-project" });
    expect(logSpy.mock.calls).toEqual([["task-1"]]);
  });

  test("clears nullable metadata and removes a parent with explicit empty values", async () => {
    handler = ({ body }) => Response.json({ ...baseTask, ...(body as object) });
    await run([
      "task", "update", "task-1", "--description", "", "--label", "", "--assignee", "",
      "--duration", "", "--deadline", "", "--parent", "", "--json"
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url.pathname).toBe("/api/v1/tasks/task-1");
    expect(requests[0]!.body).toEqual({
      description: "",
      labels: [],
      assignee_id: null,
      duration: null,
      duration_unit: null,
      deadline_date: null
    });
    expect(requests[1]!.url.pathname).toBe("/api/v1/tasks/task-1/move");
    expect(requests[1]!.body).toEqual({ parent_id: null });
  });

  test("moves by a section name scoped to a project name", async () => {
    handler = ({ url, body }) => {
      if (url.pathname === "/api/v1/projects") return Response.json({ results: [{ id: "project-1", name: "Work" }] });
      if (url.pathname === "/api/v1/sections") return Response.json({ results: [{ id: "section-1", name: "Next", project_id: "project-1" }] });
      return Response.json({ ...baseTask, ...(body as object) });
    };
    await run(["task", "update", "task-1", "--project", "Work", "--section", "Next"]);
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/api/v1/projects", "/api/v1/sections", "/api/v1/tasks/task-1/move"
    ]);
    expect(requests[2]!.body).toEqual({ section_id: "section-1" });
  });

  test("rejects ambiguous project names and reports candidate IDs", async () => {
    handler = () => Response.json({ results: [{ id: "p1", name: "Work" }, { id: "p2", name: " work " }] });
    await expect(run(["task", "add", "Ship", "--project", "WORK"])).rejects.toThrow("Ambiguous project name");
    expect(requests).toHaveLength(1);
    try {
      await run(["task", "add", "Ship", "--project", "WORK"]);
    } catch (error) {
      expect(String(error)).toContain("p1");
      expect(String(error)).toContain("p2");
    }
  });

  test("reports section not found instead of silently choosing", async () => {
    handler = ({ url }) => url.pathname === "/api/v1/projects"
      ? Response.json({ results: [{ id: "p1", name: "Work" }] })
      : Response.json({ results: [] });
    await expect(run(["task", "add", "Ship", "--project", "Work", "--section", "Missing"])).rejects.toThrow(
      "Section not found: Missing"
    );
  });

  test("project list searches across paginated results", async () => {
    handler = ({ url }) => {
      if (!url.searchParams.has("cursor")) {
        return Response.json({ results: [{ id: "p1", name: "Home" }], next_cursor: "next" });
      }
      return Response.json({ results: [{ id: "p2", name: "Work Roadmap" }] });
    };
    await run(["project", "list", "road", "--plain"]);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.url.searchParams.get("cursor")).toBe("next");
    expect(logSpy.mock.calls).toEqual([["p2\tWork Roadmap"]]);
  });

  test("section list resolves its project and emits stable plain fields", async () => {
    handler = ({ url }) => url.pathname === "/api/v1/projects"
      ? Response.json({ results: [{ id: "p1", name: "Work" }] })
      : Response.json({ results: [{ id: "s1", name: "Now", project_id: "p1" }] });
    await run(["section", "list", "--project", "Work", "--plain"]);
    expect(requests[1]!.url.searchParams.get("project_id")).toBe("p1");
    expect(logSpy.mock.calls).toEqual([["s1\tNow\tp1"]]);
  });

  test("show returns enriched JSON with reminders and a current Todoist URL", async () => {
    handler = ({ url }) => {
      if (url.pathname === "/api/v1/tasks/task-1") return Response.json({ ...baseTask, url: "https://legacy.invalid" });
      if (url.pathname === "/api/v1/reminders") {
        return Response.json({ results: [{ id: "r1", item_id: "task-1", type: "relative", minute_offset: 10 }] });
      }
      if (url.pathname === "/api/v1/projects") return Response.json({ results: [{ id: "project-1", name: "Work" }] });
      return Response.json({ results: [{ id: "section-1", name: "Release", project_id: "project-1" }] });
    };
    await run(["task", "show", "task-1", "--json"]);
    const output = JSON.parse(logSpy.mock.calls[0]![0]);
    expect(output.data.task.project).toEqual({ id: "project-1", name: "Work" });
    expect(output.data.task.section).toEqual({ id: "section-1", name: "Release" });
    expect(output.data.task.parent).toEqual({ id: "parent-1" });
    expect(output.data.task.assignee).toEqual({ id: "42" });
    expect(output.data.task.reminders).toHaveLength(1);
    expect(output.data.task.url).toBe("https://app.todoist.com/app/task/task-1");
  });

  test("show plain includes every main field and a clickable URL", async () => {
    handler = ({ url }) => {
      if (url.pathname === "/api/v1/tasks/task-1") return Response.json(baseTask);
      if (url.pathname === "/api/v1/reminders") return Response.json({ results: [] });
      if (url.pathname === "/api/v1/projects") return Response.json({ results: [{ id: "project-1", name: "Work" }] });
      return Response.json({ results: [{ id: "section-1", name: "Release", project_id: "project-1" }] });
    };
    await run(["task", "show", "task-1", "--plain"]);
    const lines = logSpy.mock.calls.map(([line]) => line);
    expect(lines).toContain("description\tDetails");
    expect(lines).toContain("deadline\t2026-09-30");
    expect(lines).toContain("duration\t30 minute");
    expect(lines).toContain("labels\trelease");
    expect(lines.at(-1)).toBe("url\thttps://app.todoist.com/app/task/task-1");
  });

  test("show remains usable when the account cannot access reminders", async () => {
    handler = ({ url }) => {
      if (url.pathname === "/api/v1/tasks/task-1") return Response.json(baseTask);
      if (url.pathname === "/api/v1/reminders") return new Response("plan required", { status: 403 });
      if (url.pathname === "/api/v1/projects") return Response.json({ results: [{ id: "project-1", name: "Work" }] });
      return Response.json({ results: [{ id: "section-1", name: "Release", project_id: "project-1" }] });
    };
    await run(["task", "show", "task-1", "--json"]);
    expect(JSON.parse(logSpy.mock.calls[0]![0]).data.task.reminders).toBeNull();
  });

  test("validates paired duration flags and real calendar deadlines", async () => {
    await expect(run(["task", "add", "Ship", "--duration", "30"])).rejects.toThrow(
      "--duration and --duration-unit must be provided together"
    );
    await expect(run(["task", "add", "Ship", "--deadline", "2026-02-30"])).rejects.toThrow(
      "--deadline must use YYYY-MM-DD"
    );
    expect(requests).toHaveLength(0);
  });
});
