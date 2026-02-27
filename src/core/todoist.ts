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

export class TodoistClient {
  constructor(private readonly cfg: EffectiveConfig) {}

  async listTasks(params: { projectId?: string; filter?: string } = {}): Promise<TodoistTask[]> {
    return this.request<TodoistTask[]>({
      path: "/rest/v2/tasks",
      query: {
        project_id: params.projectId,
        filter: params.filter
      }
    });
  }

  async addTask(input: { content: string; projectId?: string; dueString?: string; priority?: number }): Promise<TodoistTask> {
    return this.request<TodoistTask>({
      method: "POST",
      path: "/rest/v2/tasks",
      body: {
        content: input.content,
        project_id: input.projectId,
        due_string: input.dueString,
        priority: input.priority
      }
    });
  }

  async closeTask(taskId: string): Promise<void> {
    await this.request<void>({ method: "POST", path: `/rest/v2/tasks/${taskId}/close` });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.request<void>({ method: "DELETE", path: `/rest/v2/tasks/${taskId}` });
  }

  async checkReachability(): Promise<void> {
    await this.request({ path: "/rest/v2/projects" });
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const method = options.method ?? "GET";
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
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.cfg.apiToken}`,
            "Content-Type": "application/json"
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
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
