import { Command } from "commander";
import { loadStoredConfig, resolveEffectiveConfig } from "../../core/config.ts";
import { detectOutputMode, printData } from "../../core/output.ts";
import { TodoistClient } from "../../core/todoist.ts";
import { CliError } from "../../lib/errors.ts";

function normalizeSearchText(value: string): string {
  return value.replace(/\u00A0/g, " ").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function applyOverrides(config: ReturnType<typeof resolveEffectiveConfig>, opts: Record<string, string | undefined>) {
  return {
    ...config,
    endpoint: opts.endpoint || config.endpoint,
    timeout: opts.timeout ? Number(opts.timeout) : config.timeout,
    retries: opts.retries ? Number(opts.retries) : config.retries
  };
}

export function createTaskCommand(): Command {
  const command = new Command("task").description("Manage Todoist tasks");

  command
    .command("list")
    .alias("ls")
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
    .command("find")
    .aliases(["search", "f"])
    .description("Find tasks by content text")
    .argument("<query>", "Search query")
    .option("--project-id <projectId>", "Filter by project")
    .option("--limit <n>", "Max matches to return", "20")
    .option("--all", "Return all matches")
    .option("--exact", "Require exact normalized content match")
    .action(
      async (query: string, opts: { projectId?: string; limit: string; all?: boolean; exact?: boolean }) => {
        const globals = command.optsWithGlobals() as Record<string, string | undefined>;
        const mode = detectOutputMode(globals);
        const stored = await loadStoredConfig();
        const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
        const client = new TodoistClient(cfg);

        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery) {
          throw new CliError("<query> must not be empty", 2);
        }

        const list = await client.listTasks({
          projectId: opts.projectId,
          filter: `search: ${query}`
        });

        const matches = list.filter((task) => {
          const normalizedContent = normalizeSearchText(task.content);
          if (opts.exact) {
            return normalizedContent === normalizedQuery;
          }
          return normalizedContent.includes(normalizedQuery);
        });

        let limited = matches;
        if (!opts.all) {
          const limit = Number(opts.limit);
          if (!Number.isFinite(limit) || limit <= 0) {
            throw new CliError("--limit must be a positive number", 2);
          }
          limited = matches.slice(0, limit);
        }

        printData(
          mode,
          { tasks: limited, count: limited.length },
          limited.map((task) => `${task.id}\t${task.content}`)
        );
      }
    );

  command
    .command("add")
    .aliases(["a", "create"])
    .description("Add a new task")
    .argument("<content>")
    .option("--project-id <projectId>", "Project ID")
    .option("--due-string <dueString>", "Natural language due date")
    .option("--priority <priority>", "Priority 1-4")
    .option(
      "--reminder <value>",
      "Reminder value. Repeat for multiple reminders. Number => minutes before due, otherwise absolute due date/time string.",
      (value: string, previous: string[] = []) => [...previous, value],
      []
    )
    .action(
      async (
        content: string,
        opts: { projectId?: string; dueString?: string; priority?: string; reminder: string[] }
      ) => {
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
        priority,
        reminders: opts.reminder
      });
      printData(mode, { task }, [task.id]);
    });

  command
    .command("done")
    .aliases(["c", "complete"])
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
    .command("update")
    .aliases(["up", "edit"])
    .description("Update an existing task")
    .argument("<taskId>")
    .option("--content <content>", "Updated task content")
    .option("--due-string <dueString>", "Updated natural language due date")
    .option("--priority <priority>", "Updated priority 1-4")
    .option(
      "--reminder <value>",
      "Reminder value to add. Repeat for multiple reminders. Number => minutes before due, otherwise absolute due date/time string.",
      (value: string, previous: string[] = []) => [...previous, value],
      []
    )
    .action(
      async (
        taskId: string,
        opts: { content?: string; dueString?: string; priority?: string; reminder: string[] }
      ) => {
        const globals = command.optsWithGlobals() as Record<string, string | undefined>;
        const mode = detectOutputMode(globals);
        const stored = await loadStoredConfig();
        const cfg = applyOverrides(resolveEffectiveConfig(stored), globals);
        const client = new TodoistClient(cfg);

        if (!opts.content && !opts.dueString && !opts.priority && opts.reminder.length === 0) {
          throw new CliError("No updates provided. Use --content, --due-string, --priority, or --reminder.", 2);
        }

        const priority = opts.priority ? Number(opts.priority) : undefined;
        if (priority !== undefined && (priority < 1 || priority > 4)) {
          throw new CliError("--priority must be in range 1..4", 2);
        }

        const task = await client.updateTask({
          taskId,
          content: opts.content,
          dueString: opts.dueString,
          priority,
          reminders: opts.reminder
        });

        printData(mode, { task }, [task.id]);
      }
    );

  command
    .command("delete")
    .aliases(["del", "rm"])
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
