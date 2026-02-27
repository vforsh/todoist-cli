export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function toCliError(value: unknown): CliError {
  if (value instanceof CliError) {
    return value;
  }

  if (value instanceof Error) {
    return new CliError(value.message, 1);
  }

  return new CliError("Unknown error", 1);
}
