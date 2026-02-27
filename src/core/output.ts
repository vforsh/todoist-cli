import pc from "picocolors";
import type { OutputMode } from "./types.ts";

export function detectOutputMode(opts: { json?: boolean; plain?: boolean }): OutputMode {
  if (opts.json) return "json";
  if (opts.plain) return "plain";
  return "human";
}

export function printHuman(title: string, lines: string[]): void {
  console.log(pc.bold(title));
  for (const line of lines) {
    console.log(line);
  }
}

export function printData(mode: OutputMode, data: unknown, plainLines?: string[]): void {
  if (mode === "json") {
    console.log(JSON.stringify({ data }));
    return;
  }

  if (mode === "plain") {
    for (const line of plainLines ?? []) {
      console.log(line);
    }
    return;
  }

  if (typeof data === "string") {
    console.log(data);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}
