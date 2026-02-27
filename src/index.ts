import { buildProgram } from "./cli/program.ts";
import { toCliError } from "./lib/errors.ts";

export async function main(argv = process.argv): Promise<void> {
  const jsonMode = argv.includes("--json");

  try {
    const program = buildProgram();
    await program.parseAsync(argv);
  } catch (error) {
    const cliError = toCliError(error);

    if (jsonMode) {
      console.log(JSON.stringify({ error: { message: cliError.message, exitCode: cliError.exitCode } }));
    } else {
      console.error(`Error: ${cliError.message}`);
    }

    process.exitCode = cliError.exitCode;
  }
}
