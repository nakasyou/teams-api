# teams-api: Micosoft Teams CLI/TS Client

`msteams` is a lightweight TypeScript library and CLI for interacting with Microsoft Teams endpoints used by the web client.

> [!WARNING]
>
> - This package uses unofficial endpoints. Behavior may change if Microsoft updates those APIs.

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

#### Login (recommended)

```bash
teams login --ests-auth-persistent=<ESTSAUTHPERSISTENT>
```

- Default profile path: `~/.teams-cli/default.json`
- You can change the profile with `--profile`
- Running `teams login` with no token now prompts for `ESTSAUTHPERSISTENT` in interactive terminals
- How to obtain `ESTSAUTHPERSISTENT`:
  1. Use a browser other than Microsoft Edge
  2. Open `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` in your browser
  3. Open DevTools, go to the `Application` tab, then `Cookies`
  4. Copy the `ESTSAUTHPERSISTENT` cookie value and paste it into the `teams login` prompt
- You can also pass token via `--ests-auth-persistent` or `ESTSAUTHPERSISTENT`
- The default profile stores `refreshToken`, `refreshTokenExpiresIn`, and `ESTSAUTHPERSISTENT`.

`refresh_token` is deprecated and will continue to work for backward compatibility.
( `--refresh-token` / `REFRESH_TOKEN` are deprecated in favor of `ESTSAUTHPERSISTENT`)

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
- `--ests-auth-persistent=<token>`: set session token for current run (recommended)
- `--refresh-token=<token>`: set refresh token for current run (deprecated)
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
