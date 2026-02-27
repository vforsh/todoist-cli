# todoist-cli

Bun-based Todoist CLI focused on automation-friendly workflows.

## Install

```bash
bun install
bun link
```

## Configure

```bash
# secret via stdin only
printf "$TODOIST_API_TOKEN" | todoist cfg set apiToken -

# non-secret values
todoist cfg set endpoint=https://api.todoist.com retries=2 timeout=15000

# inspect
 todoist cfg ls
```

Environment variables override config values:
- `TODOIST_API_TOKEN`
- `TODOIST_ENDPOINT`
- `TODOIST_TIMEOUT`
- `TODOIST_RETRIES`

## Usage

```bash
todoist task add "Buy milk" --priority 4
todoist task add "Pay rent" --due-string "tomorrow 09:00" --reminder 60 --reminder 10
todoist task list --limit 10 --plain
todoist task done <taskId>
todoist task delete <taskId>
```

Required infrastructure commands:

```bash
todoist cfg ls
todoist doctor
todoist skill
```

## JSON / Plain modes

```bash
todoist task list --json
todoist task list --plain
```

## Development gate

```bash
bun run typecheck
bun test
```
