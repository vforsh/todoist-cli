import { CliError } from "../lib/errors.ts";
import type { TodoistProject, TodoistSection } from "./todoist.ts";

export function normalizeResourceName(value: string): string {
  return value.replace(/\u00A0/g, " ").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function filterNamedResources<T extends { name: string }>(
  resources: T[],
  query: string | undefined,
  exact = false
): T[] {
  if (query === undefined) return resources;
  const normalizedQuery = normalizeResourceName(query);
  return resources.filter((resource) => {
    const normalizedName = normalizeResourceName(resource.name);
    return exact ? normalizedName === normalizedQuery : normalizedName.includes(normalizedQuery);
  });
}

export function resolveProject(value: string, projects: TodoistProject[]): TodoistProject {
  return resolveNamedResource("project", value, projects);
}

export function resolveSection(value: string, sections: TodoistSection[]): TodoistSection {
  return resolveNamedResource("section", value, sections);
}

function resolveNamedResource<T extends { id: string; name: string }>(kind: string, value: string, resources: T[]): T {
  const byId = resources.find((resource) => resource.id === value);
  if (byId) return byId;
  const normalized = normalizeResourceName(value);
  const matches = resources.filter((resource) => normalizeResourceName(resource.name) === normalized);
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) throw new CliError(`${capitalize(kind)} not found: ${value}`, 2);
  const candidates = matches.map((resource) => `${resource.name} (${resource.id})`).join(", ");
  throw new CliError(`Ambiguous ${kind} name "${value}". Matches: ${candidates}`, 2);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
