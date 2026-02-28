---
name: todoist
description: Use the todoist CLI to manage Todoist tasks from terminal workflows. Trigger on todoist tasks, add/list/complete/delete, todo CLI automation.
---

# todoist

## Quick start

```bash
bun add -g @vforsh/todoist
printf "$TODOIST_API_TOKEN" | todoist cfg set apiToken -
todoist doctor
```

Without global install:

```bash
bunx @vforsh/todoist doctor
```

Examples:

```bash
todoist task add "Write release notes"
todoist task add "Standup prep" --due-string "tomorrow 10:00" --reminder 30 --reminder 5
todoist task update 1234567890 --content "Write release notes v2" --priority 4 --reminder 10
todoist task list --limit 20 --plain
todoist task done 1234567890
```

## Commands

- `todoist task add|a|create <content>`: create task (supports repeated `--reminder`)
- `todoist task find|search|f <query>`: find tasks by text (`--exact`, `--project-id`, `--limit`, `--all`)
- `todoist task update|up|edit <taskId>`: update content/due/priority and optionally add reminders
- `todoist task list|ls`: list tasks
- `todoist task done|c|complete <taskId>`: complete task
- `todoist task delete|del|rm <taskId>`: delete task
- `todoist cfg ls|get|set|unset|path|import|export`: manage config (`ls` is the only config subcommand alias)
- `todoist doctor` (alias `check`): readiness checks
- `todoist skill`: prints install URL for this skill

## Global flags

- `--plain`
- `--json`
- `-q, --quiet`
- `-v, --verbose`
- `--timeout <ms>`
- `--retries <n>`
- `--endpoint <url>`

## Common errors

- Exit `1`: runtime or API failure
- Exit `2`: invalid usage/flags
