import { CliError } from "../lib/errors.ts";

export function parseSetAssignments(inputs: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const input of inputs) {
    const idx = input.indexOf("=");
    if (idx <= 0 || idx === input.length - 1) {
      throw new CliError(`Expected key=value format, got: ${input}`, 2);
    }

    const key = input.slice(0, idx);
    const value = input.slice(idx + 1);
    result[key] = value;
  }

  return result;
}
