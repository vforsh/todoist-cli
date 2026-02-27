import { Command } from "commander";
import { loadStoredConfig, resolveEffectiveConfig } from "../../core/config.ts";
import { detectOutputMode, printData } from "../../core/output.ts";
import { TodoistClient } from "../../core/todoist.ts";
import { CliError } from "../../lib/errors.ts";

function applyOverrides(config: ReturnType<typeof resolveEffectiveConfig>, opts: Record<string, string | undefined>) {
  return {
    ...config,
    endpoint: opts.endpoint || config.endpoint,
    region: opts.region || config.region,
    timeout: opts.timeout ? Number(opts.timeout) : config.timeout,
    retries: opts.retries ? Number(opts.retries) : config.retries
  };
}

export function createTaskCommand(): Command {
  const command = new Command("task").description("Manage Todoist tasks");

  command
    .command("list")
    .description("List tasks")
    .option("--project-id <projectId>", "Filter by project")
    .option("--filter <query>", "Todoist filter query")
    .option("--limit <n>", "Max tasks to return", "50")
    .action(async (opts: { projectId?: string; filter?: string; limit: string }) => {
      const globals = command.optsWithGlobals() as Record<string, string | undefined>;
      const mode = detectOutputMode(globals);
      const stored = await loadStoredConfig();
      const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
      const client = new TodoistClient(cfg);
      const list = await client.listTasks({ projectId: opts.projectId, filter: opts.filter });
      const limit = Number(opts.limit);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new CliError("--limit must be a positive number", 2);
      }
      const sliced = list.slice(0, limit);
      printData(mode, { tasks: sliced, count: sliced.length }, sliced.map((task) => `${task.id}\t${task.content}`));
    });

  command
    .command("add")
    .description("Add a new task")
    .argument("<content>")
    .option("--project-id <projectId>", "Project ID")
    .option("--due-string <dueString>", "Natural language due date")
    .option("--priority <priority>", "Priority 1-4")
    .action(async (content: string, opts: { projectId?: string; dueString?: string; priority?: string }) => {
      const globals = command.optsWithGlobals() as Record<string, string | undefined>;
      const mode = detectOutputMode(globals);
      const stored = await loadStoredConfig();
      const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
      const client = new TodoistClient(cfg);
      const priority = opts.priority ? Number(opts.priority) : undefined;
      if (priority !== undefined && (priority < 1 || priority > 4)) {
        throw new CliError("--priority must be in range 1..4", 2);
      }
      const task = await client.addTask({
        content,
        projectId: opts.projectId,
        dueString: opts.dueString,
        priority
      });
      printData(mode, { task }, [task.id]);
    });

  command
    .command("done")
    .description("Mark task complete")
    .argument("<taskId>")
    .action(async (taskId: string) => {
      const globals = command.optsWithGlobals() as Record<string, string | undefined>;
      const mode = detectOutputMode(globals);
      const stored = await loadStoredConfig();
      const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
      const client = new TodoistClient(cfg);
      await client.closeTask(taskId);
      printData(mode, { closed: taskId }, [taskId]);
    });

  command
    .command("delete")
    .description("Delete task")
    .argument("<taskId>")
    .action(async (taskId: string) => {
      const globals = command.optsWithGlobals() as Record<string, string | undefined>;
      const mode = detectOutputMode(globals);
      const stored = await loadStoredConfig();
      const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
      const client = new TodoistClient(cfg);
      await client.deleteTask(taskId);
      printData(mode, { deleted: taskId }, [taskId]);
    });

  return command;
}
