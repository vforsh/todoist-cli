import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { CliError } from "../lib/errors.ts";
import type { EffectiveConfig } from "./types.ts";

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
};

type Page<T> = T[] | { results?: T[]; next_cursor?: string | null };

export type TodoistDue = {
  date: string;
  string?: string;
  lang?: string;
  timezone?: string | null;
  is_recurring?: boolean;
};

export type TodoistTask = {
  id: string;
  content: string;
  description?: string;
  project_id: string;
  section_id?: string | null;
  parent_id?: string | null;
  responsible_uid?: string | null;
  assigned_by_uid?: string | null;
  labels?: string[];
  priority?: number;
  due?: TodoistDue | null;
  deadline?: { date: string; lang?: string } | null;
  duration?: { amount: number; unit: "minute" | "day" } | null;
  is_completed?: boolean;
  checked?: boolean;
  url?: string;
  [key: string]: unknown;
};

export type TodoistProject = {
  id: string;
  name: string;
  parent_id?: string | null;
  inbox_project?: boolean;
  [key: string]: unknown;
};

export type TodoistSection = {
  id: string;
  name: string;
  project_id: string;
  [key: string]: unknown;
};

export type TodoistReminder = {
  id: string;
  item_id: string;
  type: "relative" | "absolute" | string;
  minute_offset?: number | null;
  due?: TodoistDue | null;
  is_urgent?: boolean;
  [key: string]: unknown;
};

export type TaskWriteInput = {
  content?: string;
  description?: string;
  projectId?: string;
  sectionId?: string;
  parentId?: string | null;
  labels?: string[];
  dueString?: string;
  priority?: number;
  assigneeId?: number | null;
  duration?: number | null;
  durationUnit?: "minute" | "day" | null;
  deadlineDate?: string | null;
  reminders?: string[];
};

type ReminderCommand = {
  type: "reminder_add";
  uuid: string;
  temp_id: string;
  args: {
    item_id: string;
    type: "relative" | "absolute";
    minute_offset?: number;
    due?: { date: string };
  };
};

type SyncResponse = { sync_status?: Record<string, "ok" | unknown> };

export function taskUrl(taskId: string): string {
  return `https://app.todoist.com/app/task/${taskId}`;
}

export function parseReminderValue(value: string): ReminderCommand["args"] {
  if (/^\d+$/.test(value)) {
    const minuteOffset = Number(value);
    if (!Number.isSafeInteger(minuteOffset) || minuteOffset <= 0) {
      throw new CliError(`Invalid reminder minutes value: ${value}`, 2);
    }
    return { item_id: "", type: "relative", minute_offset: minuteOffset };
  }
  if (!value.trim()) throw new CliError("Reminder value must not be empty", 2);
  return { item_id: "", type: "absolute", due: { date: value } };
}

export class TodoistClient {
  constructor(private readonly cfg: EffectiveConfig) {}

  async listTasks(params: { projectId?: string; sectionId?: string; parentId?: string; filter?: string } = {}): Promise<TodoistTask[]> {
    if (params.filter) {
      return this.listAll<TodoistTask>("/api/v1/tasks/filter", { query: params.filter });
    }
    return this.listAll<TodoistTask>("/api/v1/tasks", {
      project_id: params.projectId,
      section_id: params.sectionId,
      parent_id: params.parentId
    });
  }

  async getTask(taskId: string): Promise<TodoistTask> {
    return this.request<TodoistTask>({ path: `/api/v1/tasks/${taskId}` });
  }

  async listProjects(): Promise<TodoistProject[]> {
    return this.listAll<TodoistProject>("/api/v1/projects");
  }

  async listSections(projectId?: string): Promise<TodoistSection[]> {
    return this.listAll<TodoistSection>("/api/v1/sections", { project_id: projectId });
  }

  async listReminders(taskId: string): Promise<TodoistReminder[]> {
    return this.listAll<TodoistReminder>("/api/v1/reminders", { task_id: taskId });
  }

  async addTask(input: TaskWriteInput & { content: string }): Promise<TodoistTask> {
    const task = await this.request<TodoistTask>({
      method: "POST",
      path: "/api/v1/tasks",
      body: taskBody(input, true)
    });
    if (input.reminders?.length) await this.addTaskReminders(task.id, input.reminders);
    return task;
  }

  async updateTask(input: TaskWriteInput & { taskId: string }): Promise<TodoistTask> {
    const task = await this.request<TodoistTask>({
      method: "POST",
      path: `/api/v1/tasks/${input.taskId}`,
      body: taskBody(input, false)
    });
    if (input.reminders?.length) await this.addTaskReminders(input.taskId, input.reminders);
    return task;
  }

  async moveTask(taskId: string, target: { projectId?: string; sectionId?: string; parentId?: string | null }): Promise<TodoistTask> {
    const values = [target.projectId, target.sectionId, target.parentId].filter((value) => value !== undefined);
    if (values.length !== 1) {
      throw new CliError("Task move requires exactly one project, section, or parent target", 2);
    }
    return this.request<TodoistTask>({
      method: "POST",
      path: `/api/v1/tasks/${taskId}/move`,
      body: {
        project_id: target.projectId,
        section_id: target.sectionId,
        parent_id: target.parentId
      }
    });
  }

  async addTaskReminders(taskId: string, reminders: string[]): Promise<void> {
    const commands: ReminderCommand[] = reminders.map((value) => ({
      type: "reminder_add",
      uuid: randomUUID(),
      temp_id: randomUUID(),
      args: { ...parseReminderValue(value), item_id: taskId }
    }));
    const response = await this.sync({ commands });
    const syncStatus = response.sync_status || {};
    for (const command of commands) {
      if (syncStatus[command.uuid] !== "ok") {
        throw new CliError(`Failed to add reminder: ${String(syncStatus[command.uuid] ?? "unknown error")}`, 1);
      }
    }
  }

  async closeTask(taskId: string): Promise<void> {
    await this.request<void>({ method: "POST", path: `/api/v1/tasks/${taskId}/close` });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request<void>({ method: "DELETE", path: `/api/v1/tasks/${taskId}` });
  }

  async checkReachability(): Promise<void> {
    await this.request({ path: "/api/v1/projects" });
  }

  private async listAll<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.request<Page<T>>({ path, query: { ...query, cursor, limit: "200" } });
      if (Array.isArray(response)) {
        results.push(...response);
        break;
      }
      results.push(...(response.results ?? []));
      cursor = response.next_cursor ?? undefined;
    } while (cursor);
    return results;
  }

  private async sync(input: { commands: ReminderCommand[] }): Promise<SyncResponse> {
    const body = new URLSearchParams({ commands: JSON.stringify(input.commands) });
    return this.requestWithBody<SyncResponse>({
      method: "POST",
      path: "/api/v1/sync",
      body,
      contentType: "application/x-www-form-urlencoded"
    });
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    return this.requestWithBody<T>({
      method: options.method ?? "GET",
      path: options.path,
      query: options.query,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      contentType: options.body === undefined ? undefined : "application/json"
    });
  }

  private async requestWithBody<T>(options: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | undefined>;
    body?: string | URLSearchParams;
    contentType?: string;
  }): Promise<T> {
    const url = new URL(options.path, new URL(this.cfg.endpoint));
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    if (!this.cfg.apiToken) {
      throw new CliError("Todoist API token not configured. Set TODOIST_API_TOKEN or run: todoist cfg set apiToken -", 1);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.cfg.retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.cfg.timeout);
      try {
        const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.apiToken}` };
        if (options.contentType) headers["Content-Type"] = options.contentType;
        const response = await fetch(url, {
          method: options.method,
          headers,
          body: options.body,
          signal: controller.signal
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new CliError(`Todoist API ${response.status}: ${detail || response.statusText}`);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt === this.cfg.retries) break;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (lastError instanceof CliError) throw lastError;
    throw new CliError(lastError instanceof Error ? lastError.message : "Request failed", 1);
  }
}

function taskBody(input: TaskWriteInput, includePlacement: boolean): Record<string, unknown> {
  return omitUndefined({
    content: input.content,
    description: input.description,
    project_id: includePlacement ? input.projectId : undefined,
    section_id: includePlacement ? input.sectionId : undefined,
    parent_id: includePlacement ? input.parentId : undefined,
    labels: input.labels,
    due_string: input.dueString,
    priority: input.priority,
    assignee_id: input.assigneeId,
    duration: input.duration,
    duration_unit: input.durationUnit,
    deadline_date: input.deadlineDate
  });
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
