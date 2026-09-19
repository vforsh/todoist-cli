import { printData } from "../../core/output.ts";
import { taskUrl, type TodoistClient, type TodoistReminder, type TodoistTask } from "../../core/todoist.ts";
import type { OutputMode } from "../../core/types.ts";
import { CliError } from "../../lib/errors.ts";

export async function showTask(client: TodoistClient, taskId: string, mode: OutputMode): Promise<void> {
  const [task, reminders, projects, sections] = await Promise.all([
    client.getTask(taskId),
    listAvailableReminders(client, taskId),
    client.listProjects(),
    client.listSections()
  ]);
  const project = projects.find((item) => item.id === task.project_id);
  const section = sections.find((item) => item.id === task.section_id);
  const details = {
    ...task,
    url: taskUrl(task.id),
    project: { id: task.project_id, name: project?.name },
    section: task.section_id ? { id: task.section_id, name: section?.name } : null,
    parent: task.parent_id ? { id: task.parent_id } : null,
    assignee: task.responsible_uid ? { id: task.responsible_uid } : null,
    reminders
  };
  printData(mode, { task: details }, plainTask(details));
}

type TaskDetails = TodoistTask & {
  url: string;
  project: { id: string; name?: string };
  section: { id: string; name?: string } | null;
  parent: { id: string } | null;
  assignee: { id: string } | null;
  reminders: TodoistReminder[] | null;
};

function plainTask(task: TaskDetails): string[] {
  return [
    line("id", task.id),
    line("content", task.content),
    line("description", task.description ?? ""),
    line("project", namedResource(task.project)),
    line("section", task.section ? namedResource(task.section) : ""),
    line("parent", task.parent?.id ?? ""),
    line("assignee", task.assignee?.id ?? ""),
    line("due", task.due?.string ?? task.due?.date ?? ""),
    line("deadline", task.deadline?.date ?? ""),
    line("duration", task.duration ? `${task.duration.amount} ${task.duration.unit}` : ""),
    line("labels", (task.labels ?? []).join(",")),
    ...(task.reminders ?? []).map((reminder) => line("reminder", formatReminder(reminder))),
    line("url", task.url)
  ];
}

function namedResource(resource: { id: string; name?: string }): string {
  return resource.name ? `${resource.name} (${resource.id})` : resource.id;
}

function formatReminder(reminder: TodoistReminder): string {
  if (reminder.type === "relative") return `${reminder.minute_offset ?? ""} minutes`;
  return reminder.due?.string ?? reminder.due?.date ?? reminder.id;
}

function line(key: string, value: string): string {
  return `${key}\t${value.replace(/\r?\n/g, "\\n")}`;
}

async function listAvailableReminders(client: TodoistClient, taskId: string): Promise<TodoistReminder[] | null> {
  try {
    return await client.listReminders(taskId);
  } catch (error) {
    if (error instanceof CliError && error.message.startsWith("Todoist API 403:")) return null;
    throw error;
  }
}
