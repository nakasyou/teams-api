# teams-api: Micosoft Teams CLI/TS Client

`msteams` is a lightweight TypeScript library and CLI for interacting with Microsoft Teams endpoints used by the web client.

> [!WARNING]
> * Auth token should be updated in 24 hours. Automatic token updating is working in progress.
> * This package uses unofficial endpoints. Behavior may change if Microsoft updates those APIs.

## CLI

### Installation

Temporary running:
```bash
npx msteams # npm
bunx msteams # Bun
deno run -A npm:msteams # Deno
pnpm dlx msteams # pnpm
```

Global install:
```bash
npm i -g msteams # npm
bun i -g msteams # Bun
deno install --global -A npm:msteams
pnpm i -g msteams
```

Install a skill for AI agents:
```bash
bunx skills add nakasyou/teams-api
```

### Usage

#### Help

Show help:
```bash
teams --help
```

#### Set refresh token

```bash
bunx --bun teams set-refresh-token --refresh-token=<your_refresh_token>
```
- Default profile path: `~/.teams-cli/default.json`
- You can change the profile with `--profile`
- You can also pass token via `--refresh-token` or `REFRESH_TOKEN`

#### Common commands

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

#### Common options

- `--json`: output only JSON
- `--no-color`: disable ANSI colors
- `--profile=<name>`: use another local profile name
- `--profile-json=<path>`: use a custom profile JSON file
- `--refresh-token=<token>`: set token for current run
- `--help`: show help

## Library

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
bun run fmt
bun run build
```

The package uses Vite+ to build both library and CLI entry points.

## License

MIT
