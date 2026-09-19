import type { Command } from "commander";
import { resolveProject, resolveSection } from "../../core/resources.ts";
import type { TaskWriteInput, TodoistClient } from "../../core/todoist.ts";
import { CliError } from "../../lib/errors.ts";

export type TaskOptions = {
  content?: string;
  description?: string;
  project?: string;
  projectId?: string;
  section?: string;
  sectionId?: string;
  parent?: string;
  label?: string[];
  dueString?: string;
  priority?: string;
  assignee?: string;
  duration?: string;
  durationUnit?: string;
  deadline?: string;
  reminder?: string[];
};

export function addTaskWriteOptions(command: Command, update = false): Command {
  command
    .option("--description <description>", update ? 'Updated description (use "" to clear)' : "Task description")
    .option("--project <name-or-id>", "Project name or ID")
    .option("--project-id <projectId>", "Project raw ID (backward compatible)")
    .option("--section <name-or-id>", "Section name or ID")
    .option("--section-id <sectionId>", "Section raw ID")
    .option("--parent <taskId>", update ? 'Parent task ID (use "" to remove parent)' : "Parent task ID")
    .option(
      "--label <name>",
      update ? 'Label name; repeat to replace labels (use "" once to clear)' : "Label name; repeat for multiple labels",
      collect,
      undefined
    )
    .option("--due-string <dueString>", "Natural language due date")
    .option("--priority <priority>", "Priority 1-4")
    .option("--assignee <userId>", update ? 'Assignee user ID (use "" to clear)' : "Assignee user ID")
    .option("--duration <amount>", update ? 'Duration amount (use "" to clear)' : "Duration amount")
    .option("--duration-unit <unit>", "Duration unit: minute or day")
    .option("--deadline <YYYY-MM-DD>", update ? 'Deadline date (use "" to clear)' : "Deadline date")
    .option(
      "--reminder <value>",
      "Reminder to add; repeat. Number means minutes before due, otherwise an absolute date/time string.",
      collect,
      undefined
    );
  return command;
}

export async function buildTaskInput(client: TodoistClient, opts: TaskOptions, update: boolean): Promise<TaskWriteInput> {
  if (opts.project && opts.projectId) throw new CliError("Use only one of --project or --project-id", 2);
  if (opts.section && opts.sectionId) throw new CliError("Use only one of --section or --section-id", 2);
  if (opts.parent !== undefined && (opts.project || opts.projectId || opts.section || opts.sectionId)) {
    throw new CliError("--parent cannot be combined with --project or --section", 2);
  }

  const projectId = opts.project
    ? resolveProject(opts.project, await client.listProjects()).id
    : opts.projectId;
  const sectionId = opts.section
    ? resolveSection(opts.section, await client.listSections(projectId)).id
    : opts.sectionId;

  return {
    content: opts.content,
    description: opts.description,
    projectId,
    sectionId,
    parentId: parseParent(opts.parent, update),
    labels: parseLabels(opts.label, update),
    dueString: opts.dueString,
    priority: parsePriority(opts.priority),
    assigneeId: parseAssignee(opts.assignee, update),
    ...parseDuration(opts.duration, opts.durationUnit, update),
    deadlineDate: parseDeadline(opts.deadline, update),
    reminders: opts.reminder
  };
}

export function hasTaskMetadata(input: TaskWriteInput): boolean {
  return [
    input.content,
    input.description,
    input.labels,
    input.dueString,
    input.priority,
    input.assigneeId,
    input.duration,
    input.durationUnit,
    input.deadlineDate
  ].some((value) => value !== undefined);
}

export function hasMove(input: TaskWriteInput): boolean {
  return input.projectId !== undefined || input.sectionId !== undefined || input.parentId !== undefined;
}

export function moveTarget(input: TaskWriteInput): { projectId?: string; sectionId?: string; parentId?: string | null } {
  if (input.parentId !== undefined) return { parentId: input.parentId };
  if (input.sectionId !== undefined) return { sectionId: input.sectionId };
  return { projectId: input.projectId };
}

function collect(value: string, previous?: string[]): string[] {
  return [...(previous ?? []), value];
}

function parsePriority(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const priority = Number(value);
  if (!Number.isSafeInteger(priority) || priority < 1 || priority > 4) {
    throw new CliError("--priority must be an integer in range 1..4", 2);
  }
  return priority;
}

function parseLabels(values: string[] | undefined, update: boolean): string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length === 1 && values[0] === "") {
    if (!update) throw new CliError("--label must not be empty when adding a task", 2);
    return [];
  }
  if (values.some((value) => !value.trim())) throw new CliError("--label values must not be empty", 2);
  return values;
}

function parseAssignee(value: string | undefined, update: boolean): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") {
    if (!update) throw new CliError("--assignee must not be empty when adding a task", 2);
    return null;
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new CliError("--assignee must be a positive integer user ID", 2);
  return id;
}

function parseDuration(
  amountValue: string | undefined,
  unitValue: string | undefined,
  update: boolean
): Pick<TaskWriteInput, "duration" | "durationUnit"> {
  if (amountValue === undefined && unitValue === undefined) return {};
  if (amountValue === "") {
    if (!update) throw new CliError("--duration must not be empty when adding a task", 2);
    if (unitValue !== undefined) throw new CliError("Do not pass --duration-unit when clearing duration", 2);
    return { duration: null, durationUnit: null };
  }
  if (amountValue === undefined || unitValue === undefined) {
    throw new CliError("--duration and --duration-unit must be provided together", 2);
  }
  const amount = Number(amountValue);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new CliError("--duration must be a positive integer", 2);
  if (unitValue !== "minute" && unitValue !== "day") {
    throw new CliError("--duration-unit must be minute or day", 2);
  }
  return { duration: amount, durationUnit: unitValue };
}

function parseDeadline(value: string | undefined, update: boolean): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") {
    if (!update) throw new CliError("--deadline must not be empty when adding a task", 2);
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
  const valid = Boolean(
    match &&
    date &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
  if (!valid) {
    throw new CliError("--deadline must use YYYY-MM-DD", 2);
  }
  return value;
}

function parseParent(value: string | undefined, update: boolean): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === "" && !update) throw new CliError("--parent must not be empty when adding a task", 2);
  return value === "" ? null : value;
}
