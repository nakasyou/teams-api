# teams-api

`msteams` is a lightweight TypeScript library and CLI for interacting with Microsoft Teams endpoints used by the web client.

## Overview

- CLI: use the `teams` command to fetch notifications, messages, channels, and user/team data
- Library: use `TeamsClient` and `TokenManager` to access the same endpoints from TypeScript
- Token handling: refresh token is stored as a local profile in `~/.teams-cli/<name>.json`
- Machine mode: use `--json` for scripts and automation

> Warning: This package uses unofficial endpoints. Behavior may change if Microsoft updates those APIs.

## Install

```bash
bun add msteams
```

```bash
npm install msteams
```

## CLI usage

```bash
# Show help
teams --help
```

### Set refresh token

```bash
teams set-refresh-token --refresh-token=<your_refresh_token>
```

- Default profile path: `~/.teams-cli/default.json`
- You can change the profile with `--profile`
- You can also pass token via `--refresh-token` or `REFRESH_TOKEN`

### Common commands

```bash
# Fetch latest notifications (default: 20)
teams notifications [--limit N]

# Fetch conversation messages
teams messages <conversationId> [--limit N]

# Fetch channel messages
teams channel messages <channelId> [--limit N]

# List teams
teams teams list

# List channels in a team
teams teams channels <teamId>

# Fetch current user snapshot
teams me
```

### Common options

- `--json`: output only JSON
- `--no-color`: disable ANSI colors
- `--profile=<name>`: use another local profile name
- `--profile-json=<path>`: use a custom profile JSON file
- `--refresh-token=<token>`: set token for current run
- `--help`: show help

## Library usage

```ts
import { TeamsClient, TokenManager } from 'msteams'

const tokenManager = new TokenManager(process.env.REFRESH_TOKEN || '')
const client = new TeamsClient(tokenManager)

const me = await client.teams.users.me.fetch()
console.log(me.teams?.length ?? 0, 'teams')
```

```ts
const notifications = await client.teams.notifications.fetchMessages({ pageSize: 10 })
console.log(notifications.messages?.length ?? 0)
```

### Exported API

- `TokenManager`
- `ScopeTokenProvider`
- `TeamsClient`
- `teams.conversations.fetchMessages`
- `teams.notifications.fetchMessages`, `fetchMentions`, `fetchAnnotations`
- `teams.channels.fetch`, `teams.channels.fetchMessages`
- `teams.users.fetchShortProfile`
- `teams.users.me.fetch`, `teams.users.me.fetchPinnedChannels`

## Development

```bash
bun install
bun run build
bun run fmt
```

The package uses `vite-plus` to build both library and CLI entry points.

## Repository

- https://github.com/nakasyou/teams-api

## License

MIT
