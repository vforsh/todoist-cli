# todoist-cli

Bun-based Todoist CLI focused on automation-friendly workflows.

## Install and configure

```bash
bun add -g @vforsh/todoist
printf "$TODOIST_API_TOKEN" | todoist cfg set apiToken -
todoist doctor
```

Run without a global install:

```bash
bunx @vforsh/todoist --help
```

Environment variables override stored configuration:

- `TODOIST_API_TOKEN`
- `TODOIST_ENDPOINT`
- `TODOIST_TIMEOUT`
- `TODOIST_RETRIES`

## Projects and sections

```bash
todoist project list
todoist project list "roadmap" --plain
todoist project list "Work" --exact --json
todoist section list
todoist section list "Next" --project "Work"
todoist section list --project-id <projectId> --plain
```

`--project <name-or-id>` and `--section <name-or-id>` resolve names using a
case-insensitive, whitespace-normalized exact match. Duplicate names fail with
an ambiguity error listing candidate IDs. Missing names fail explicitly.
Existing `--project-id` usage remains unchanged and skips discovery.

## Add tasks

```bash
todoist task add "Buy milk" --description "Two cartons of oat milk"
todoist task add "Ship release" \
  --project "Work" \
  --section "Ready" \
  --label release --label urgent \
  --due-string "tomorrow 10:00" \
  --deadline 2026-09-30 \
  --duration 30 --duration-unit minute \
  --priority 2 \
  --assignee 123456789 \
  --reminder 60 --reminder 10
todoist task add "Write tests" --parent <parentTaskId>
todoist task add "Raw IDs" --project-id <projectId> --section-id <sectionId>
```

Duration units are `minute` and `day`. Deadlines use `YYYY-MM-DD`. Assignees
are Todoist user IDs. `--label` and `--reminder` are repeatable.

## Update tasks

```bash
todoist task update <taskId> --content "Buy milk and bread" --priority 4
todoist task update <taskId> --description "One carton of oat milk"
todoist task update <taskId> --label errands --label shopping
todoist task update <taskId> --duration 2 --duration-unit day
todoist task update <taskId> --deadline 2026-10-01 --assignee 123456789
todoist task update <taskId> --project "Personal"
todoist task update <taskId> --project "Work" --section "Ready"
todoist task update <taskId> --parent <parentTaskId>
```

Explicit empty strings clear supported values; omission preserves them:

```bash
todoist task update <taskId> --description ""
todoist task update <taskId> --label ""
todoist task update <taskId> --duration ""
todoist task update <taskId> --deadline ""
todoist task update <taskId> --assignee ""
todoist task update <taskId> --parent ""
```

Updating labels replaces the complete label list. Moving to a section sends a
section move; when `--project` is also present it scopes section-name resolution.
Todoist accepts one move target, so `--parent` cannot be combined with a project
or section move.

## Inspect and find tasks

```bash
todoist task show <taskId>
todoist task show <taskId> --plain
todoist task show <taskId> --json
todoist task list --limit 10 --plain
todoist task find "release notes" --exact
todoist task find "release" --project-id <projectId> --all
```

`task show` returns content, description, due date, deadline, duration, labels,
reminders, project, section, parent, assignee, and a current Todoist task URL.
Project and section names are included when available.

## Complete and delete

```bash
todoist task done <taskId>
todoist task delete <taskId>
```

Aliases include `task a|create`, `task up|edit`, `task get`, `task c|complete`,
`task del|rm`, `task ls`, `task search|f`, `project ls`, and `section ls`.

## Output contracts

- Default: pretty JSON, preserving the existing human-mode contract.
- `--json`: one JSON object shaped as `{ "data": ... }`.
- `--plain`: stable tab-separated lines suitable for shell pipelines.

Errors use exit code `2` for invalid CLI usage and `1` for runtime/API failure.

## Todoist API limitations

- Reminders depend on the Todoist account plan.
- `task show` reads active tasks; Todoist's single-task endpoint does not return
  completed tasks.
- Assignees are accepted as user IDs; collaborator discovery is not exposed yet.
- Task moves are separate API calls from metadata updates. If metadata succeeds
  and a following move fails, Todoist offers no transaction to roll it back.

## Development gate

```bash
bun run typecheck
bun test
```
