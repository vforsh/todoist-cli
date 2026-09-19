import { Command } from "commander";
import { filterNamedResources } from "../../core/resources.ts";
import { printData } from "../../core/output.ts";
import { createCommandContext } from "../context.ts";
import { positiveInteger } from "../values.ts";

export function createProjectCommand(): Command {
  const command = new Command("project").description("Discover Todoist projects");

  command
    .command("list")
    .alias("ls")
    .description("List projects, optionally searching by name")
    .argument("[query]", "Case-insensitive name search")
    .option("--exact", "Require an exact normalized name")
    .option("--limit <n>", "Max projects to return", "50")
    .action(async (query: string | undefined, opts: { exact?: boolean; limit: string }) => {
      const { client, mode } = await createCommandContext(command);
      const limit = positiveInteger(opts.limit, "--limit");
      const projects = filterNamedResources(await client.listProjects(), query, opts.exact).slice(0, limit);
      printData(mode, { projects, count: projects.length }, projects.map((project) => `${project.id}\t${project.name}`));
    });

  return command;
}
