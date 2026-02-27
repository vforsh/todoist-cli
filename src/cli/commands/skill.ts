import { Command } from "commander";

export function createSkillCommand(): Command {
  const command = new Command("skill").description("Print skill installation URL");

  command.action(() => {
    console.log("https://github.com/vforsh/todoist-cli/tree/main/skill/todoist");
  });

  return command;
}
