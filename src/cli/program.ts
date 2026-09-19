import { Command } from "commander";
import packageJson from "../../package.json";
import { createConfigCommand } from "./commands/config.ts";
import { createDoctorCommand } from "./commands/doctor.ts";
import { createSkillCommand } from "./commands/skill.ts";
import { createTaskCommand } from "./commands/task.ts";
import { createProjectCommand } from "./commands/project.ts";
import { createSectionCommand } from "./commands/section.ts";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("todoist")
    .description("Todoist CLI with Bun + TypeScript")
    .version(packageJson.version)
    .option("--json", "Output machine-readable JSON")
    .option("--plain", "Output stable plain lines")
    .option("-q, --quiet", "Reduce non-critical logs")
    .option("-v, --verbose", "Verbose diagnostics")
    .option("--timeout <ms>", "Request timeout in ms")
    .option("--retries <n>", "Retry count")
    .option("--endpoint <url>", "Todoist API endpoint")
    .showHelpAfterError();

  program.addCommand(createTaskCommand());
  program.addCommand(createProjectCommand());
  program.addCommand(createSectionCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createSkillCommand());

  return program;
}
