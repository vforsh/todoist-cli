---
name: todoist
description: Use the todoist CLI to manage Todoist tasks from terminal workflows. Trigger on todoist tasks, add/list/complete/delete, todo CLI automation.
---

# todoist

## Quick start

```bash
bun link
printf "$TODOIST_API_TOKEN" | todoist cfg set apiToken -
todoist doctor
```

Examples:

```bash
todoist task add "Write release notes"
todoist task list --limit 20 --plain
todoist task done 1234567890
```

## Commands

- `todoist task add <content>`: create task
- `todoist task list`: list tasks
- `todoist task done <taskId>`: complete task
- `todoist task delete <taskId>`: delete task
- `todoist cfg ls|get|set|unset|path|import|export`: manage config
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
- `--region <name>`

## Common errors

- Exit `1`: runtime or API failure
- Exit `2`: invalid usage/flags
