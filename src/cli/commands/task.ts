import { Command } from "commander";
import { normalizeResourceName } from "../../core/resources.ts";
import { printData } from "../../core/output.ts";
import type { TaskWriteInput, TodoistClient, TodoistTask } from "../../core/todoist.ts";
import { CliError } from "../../lib/errors.ts";
import { createCommandContext } from "../context.ts";
import { positiveInteger } from "../values.ts";
import {
  addTaskWriteOptions,
  buildTaskInput,
  hasMove,
  hasTaskMetadata,
  moveTarget,
  type TaskOptions
} from "./task-options.ts";
import { showTask } from "./task-show.ts";

export function createTaskCommand(): Command {
  const command = new Command("task").description("Manage Todoist tasks");

  command
    .command("list")
    .alias("ls")
    .description("List tasks")
    .option("--project-id <projectId>", "Filter by project raw ID")
    .option("--filter <query>", "Todoist filter query")
    .option("--limit <n>", "Max tasks to return", "50")
    .action(async (opts: { projectId?: string; filter?: string; limit: string }) => {
      const { client, mode } = await createCommandContext(command);
      const list = await client.listTasks({ projectId: opts.projectId, filter: opts.filter });
      const sliced = list.slice(0, positiveInteger(opts.limit, "--limit"));
      printData(mode, { tasks: sliced, count: sliced.length }, sliced.map((task) => `${task.id}\t${task.content}`));
    });

  command
    .command("find")
    .aliases(["search", "f"])
    .description("Find tasks by content text")
    .argument("<query>", "Search query")
    .option("--project-id <projectId>", "Filter by project raw ID")
    .option("--limit <n>", "Max matches to return", "20")
    .option("--all", "Return all matches")
    .option("--exact", "Require exact normalized content match")
    .action(async (query: string, opts: { projectId?: string; limit: string; all?: boolean; exact?: boolean }) => {
      const { client, mode } = await createCommandContext(command);
      const normalizedQuery = normalizeResourceName(query);
      if (!normalizedQuery) throw new CliError("<query> must not be empty", 2);
      const list = await client.listTasks({ projectId: opts.projectId, filter: `search: ${query}` });
      const matches = list.filter((task) => {
        if (opts.projectId && task.project_id !== opts.projectId) return false;
        const content = normalizeResourceName(task.content);
        return opts.exact ? content === normalizedQuery : content.includes(normalizedQuery);
      });
      const limited = opts.all ? matches : matches.slice(0, positiveInteger(opts.limit, "--limit"));
      printData(mode, { tasks: limited, count: limited.length }, limited.map((task) => `${task.id}\t${task.content}`));
    });

  const add = addTaskWriteOptions(
    command.command("add").aliases(["a", "create"]).description("Add a new task").argument("<content>"),
    false
  );
  add.action(async (content: string, opts: TaskOptions) => {
    const { client, mode } = await createCommandContext(command);
    const input = await buildTaskInput(client, opts, false);
    const task = await client.addTask({ ...input, content });
    printData(mode, { task }, [task.id]);
  });

  command
    .command("show")
    .alias("get")
    .description("Show a complete active task")
    .argument("<taskId>")
    .action(async (taskId: string) => {
      const { client, mode } = await createCommandContext(command);
      await showTask(client, taskId, mode);
    });

  command
    .command("done")
    .aliases(["c", "complete"])
    .description("Mark task complete")
    .argument("<taskId>")
    .action(async (taskId: string) => {
      const { client, mode } = await createCommandContext(command);
      await client.closeTask(taskId);
      printData(mode, { closed: taskId }, [taskId]);
    });

  const update = addTaskWriteOptions(
    command.command("update").aliases(["up", "edit"]).description("Update an existing task").argument("<taskId>")
      .option("--content <content>", "Updated task content"),
    true
  );
  update.action(async (taskId: string, opts: TaskOptions) => {
    const { client, mode } = await createCommandContext(command);
    const input = await buildTaskInput(client, opts, true);
    const reminders = input.reminders ?? [];
    if (!hasTaskMetadata(input) && !hasMove(input) && reminders.length === 0) {
      throw new CliError("No updates provided. See todoist task update --help.", 2);
    }

    const task = await executeTaskUpdate(client, taskId, input);
    printData(mode, { task }, [task.id]);
  });

  command
    .command("delete")
    .aliases(["del", "rm"])
    .description("Delete task")
    .argument("<taskId>")
    .action(async (taskId: string) => {
      const { client, mode } = await createCommandContext(command);
      await client.deleteTask(taskId);
      printData(mode, { deleted: taskId }, [taskId]);
    });

  return command;
}

async function executeTaskUpdate(client: TodoistClient, taskId: string, input: TaskWriteInput): Promise<TodoistTask> {
  const reminders = input.reminders ?? [];
  if (!hasTaskMetadata(input) && reminders.length === 0) {
    return client.moveTask(taskId, moveTarget(input));
  }

  let task: TodoistTask;
  if (hasTaskMetadata(input)) {
    task = await client.updateTask({ ...input, taskId });
  } else {
    await client.addTaskReminders(taskId, reminders);
    task = await client.getTask(taskId);
  }

  return hasMove(input) ? client.moveTask(taskId, moveTarget(input)) : task;
}
