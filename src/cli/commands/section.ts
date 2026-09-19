import { Command } from "commander";
import { filterNamedResources, resolveProject } from "../../core/resources.ts";
import { printData } from "../../core/output.ts";
import { CliError } from "../../lib/errors.ts";
import { createCommandContext } from "../context.ts";
import { positiveInteger } from "../values.ts";

export function createSectionCommand(): Command {
  const command = new Command("section").description("Discover Todoist sections");

  command
    .command("list")
    .alias("ls")
    .description("List sections, optionally searching by name")
    .argument("[query]", "Case-insensitive name search")
    .option("--project <name-or-id>", "Limit to a project by name or ID")
    .option("--project-id <projectId>", "Limit to a project by raw ID")
    .option("--exact", "Require an exact normalized name")
    .option("--limit <n>", "Max sections to return", "50")
    .action(async (query: string | undefined, opts: SectionListOptions) => {
      const { client, mode } = await createCommandContext(command);
      if (opts.project && opts.projectId) throw new CliError("Use only one of --project or --project-id", 2);
      const projectId = opts.project
        ? resolveProject(opts.project, await client.listProjects()).id
        : opts.projectId;
      const sections = filterNamedResources(await client.listSections(projectId), query, opts.exact)
        .slice(0, positiveInteger(opts.limit, "--limit"));
      printData(
        mode,
        { sections, count: sections.length },
        sections.map((section) => `${section.id}\t${section.name}\t${section.project_id}`)
      );
    });

  return command;
}

type SectionListOptions = {
  project?: string;
  projectId?: string;
  exact?: boolean;
  limit: string;
};
