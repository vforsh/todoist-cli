---
name: todoist
description: Use the todoist CLI to manage Todoist tasks, projects, sections, metadata, and automation-friendly output.
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

## Common workflows

```bash
todoist project list "Work" --plain
todoist section list --project "Work" --plain
todoist task add "Write release notes" --project "Work" --section "Ready"
todoist task add "Review" --label release --label urgent --duration 30 --duration-unit minute
todoist task update 1234567890 --description "Details" --deadline 2026-09-30
todoist task update 1234567890 --description "" --label ""
todoist task show 1234567890 --json
todoist task list --limit 20 --plain
todoist task done 1234567890
```

## Commands

- `todoist project list|ls [query]`: discover/search projects (`--exact`, `--limit`)
- `todoist section list|ls [query]`: discover/search sections (`--project`, `--project-id`, `--exact`, `--limit`)
- `todoist task add|a|create <content>`: create a task
- `todoist task update|up|edit <taskId>`: update metadata or move a task
- `todoist task show|get <taskId>`: read complete active-task details and reminders
- `todoist task find|search|f <query>`: find tasks by text
- `todoist task list|ls`: list active tasks
- `todoist task done|c|complete <taskId>`: complete a task
- `todoist task delete|del|rm <taskId>`: delete a task
- `todoist cfg ls|get|set|unset|path|import|export`: manage config
- `todoist doctor|check`: readiness checks

Task writes support `--description`, `--project`, `--project-id`, `--section`,
`--section-id`, `--parent`, repeatable `--label`, `--due-string`, `--priority`,
`--assignee`, `--duration` with `--duration-unit minute|day`,
`--deadline <YYYY-MM-DD>`, and repeatable `--reminder`.

On update, explicit empty strings clear description, labels, assignee, duration,
deadline, or parent. Omitted options remain unchanged. Name resolution is exact
after case/whitespace normalization; ambiguous or missing names are errors.

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
- Reminders may be unavailable on the current Todoist plan.
- `task show` reads active tasks only.
