import { CliError } from "../lib/errors.ts";

export function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError(`${option} must be a positive integer`, 2);
  }
  return parsed;
}
