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

export type TodoistTask = {
  id: string;
  content: string;
  project_id: string;
  is_completed: boolean;
  url: string;
};

type TaskListResponse = TodoistTask[] | { results?: TodoistTask[] };

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

type SyncResponse = {
  sync_status?: Record<string, "ok" | unknown>;
};

export function parseReminderValue(value: string): ReminderCommand["args"] {
  if (/^\d+$/.test(value)) {
    const minuteOffset = Number(value);
    if (!Number.isFinite(minuteOffset) || minuteOffset <= 0) {
      throw new CliError(`Invalid reminder minutes value: ${value}`, 2);
    }

    return {
      item_id: "",
      type: "relative",
      minute_offset: minuteOffset
    };
  }

  // Non-numeric reminder values are treated as absolute date/time strings.
  return {
    item_id: "",
    type: "absolute",
    due: { date: value }
  };
}

export class TodoistClient {
  constructor(private readonly cfg: EffectiveConfig) {}

  async listTasks(params: { projectId?: string; filter?: string } = {}): Promise<TodoistTask[]> {
    const response = await this.request<TaskListResponse>({
      path: "/api/v1/tasks",
      query: {
        project_id: params.projectId,
        filter: params.filter
      }
    });

    if (Array.isArray(response)) {
      return response;
    }

    return response.results ?? [];
  }

  async addTask(input: {
    content: string;
    projectId?: string;
    dueString?: string;
    priority?: number;
    reminders?: string[];
  }): Promise<TodoistTask> {
    const task = await this.request<TodoistTask>({
      method: "POST",
      path: "/api/v1/tasks",
      body: {
        content: input.content,
        project_id: input.projectId,
        due_string: input.dueString,
        priority: input.priority
      }
    });

    if (input.reminders && input.reminders.length > 0) {
      await this.addTaskReminders(task.id, input.reminders);
    }

    return task;
  }

  async addTaskReminders(taskId: string, reminders: string[]): Promise<void> {
    const commands: ReminderCommand[] = reminders.map((value) => {
      const parsed = parseReminderValue(value);
      return {
        type: "reminder_add",
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
          ...parsed,
          item_id: taskId
        }
      };
    });

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

  private async sync(input: { commands: ReminderCommand[] }): Promise<SyncResponse> {
    const body = new URLSearchParams({
      commands: JSON.stringify(input.commands)
    });

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
      body: options.body ? JSON.stringify(options.body) : undefined,
      contentType: options.body ? "application/json" : undefined
    });
  }

  private async requestWithBody<T>(options: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | undefined>;
    body?: string | URLSearchParams;
    contentType?: string;
  }): Promise<T> {
    const method = options.method;
    const baseUrl = new URL(this.cfg.endpoint);
    const url = new URL(options.path, baseUrl);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value) {
          url.searchParams.set(key, value);
        }
      }
    }

    if (!this.cfg.apiToken) {
      throw new CliError("Todoist API token not configured. Set TODOIST_API_TOKEN or run: todoist cfg set apiToken -", 1);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.cfg.retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.cfg.timeout);

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.cfg.apiToken}`
        };

        if (options.contentType) {
          headers["Content-Type"] = options.contentType;
        }

        const response = await fetch(url, {
          method,
          headers,
          body: options.body,
          signal: controller.signal
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new CliError(`Todoist API ${response.status}: ${detail || response.statusText}`);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt === this.cfg.retries) {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (lastError instanceof CliError) {
      throw lastError;
    }

    throw new CliError(lastError instanceof Error ? lastError.message : "Request failed", 1);
  }
}
