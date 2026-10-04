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
  2. Open `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` in your browser. Even if a warning or sign-in error appears, continue to the next step.
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

#### Files and folders

```bash
# Discover document libraries and the channel's file folder
teams files drives <teamId-or-groupId>
teams files channel <teamId-or-groupId> <channelId>
teams files list <driveId> [folderItemId]
teams files search <driveId> "report"

# Resolve and save a file shared in a message
teams files resolve "https://example.sharepoint.com/sites/class/Shared%20Documents/report.pdf"
teams files download <driveId> <itemId> --output ./report.pdf
teams files download "https://example.sharepoint.com/sites/class/Shared%20Documents/report.pdf" --output ./report.pdf
teams files download-folder <driveId> <folderItemId> --output ./downloads

# Browse SharePoint directly, including all nested folders
teams files sharepoint <siteUrl> "/sites/class/Shared Documents" --recursive
teams files download-sharepoint <siteUrl> "/sites/class/Shared Documents" --output ./downloads

# Create, upload, edit, move, copy, and delete
teams files mkdir <driveId> root "Reports"
teams files upload <driveId> <folderItemId> ./report.pdf
teams files upload <driveId> <folderItemId> ./report.pdf --conflict replace
teams files replace <driveId> <itemId> ./updated-report.pdf --if-match '<etag>'
teams files rename <driveId> <itemId> "new-name.pdf"
teams files move <driveId> <itemId> <destinationFolderId>
teams files copy <driveId> <itemId> <destinationDriveId> <destinationFolderId>
teams files delete <driveId> <itemId>
```

`teamId` is the Teams thread ID returned by `teams teams list`; it is resolved to the Microsoft 365 group ID automatically. `files drives` also accepts `me` or `user:<userId>` for personal OneDrive libraries. Drive IDs and item IDs come from the file commands. A SharePoint library path is server-relative, such as `/sites/class/Shared Documents`.

Downloads preserve binary content, stream to disk, and refuse to overwrite existing local files. Folder downloads include all nested folders. OneNote packages use the notebook export commands below. Uploads default to `--conflict fail`; `replace` and `rename` are explicit alternatives. Files over 4 MiB use sequential upload-session chunks. `--if-match` is available for upload, replacement, rename, move, and deletion.

#### OneNote and Class Notebook

```bash
teams notebooks list <teamId-or-groupId>
teams notebooks sections <scope> <notebookId>
teams notebooks section-groups <scope> <notebookId>
teams notebooks sections <scope> --section-group <sectionGroupId>
teams notebooks pages <scope> <sectionId>
teams notebooks download-page <scope> <pageId> --output ./page.html
teams notebooks export <scope> <notebookId> --output ./notebook

teams notebooks create <scope> "Notebook"
teams notebooks create-section <scope> <notebookId> "Notes"
teams notebooks create-page <scope> <sectionId> --input ./page.html
teams notebooks create-page <scope> <sectionId> --input ./page.html --attachment file1=./report.pdf
teams notebooks patch-page <scope> <pageId> --input ./commands.json
teams notebooks delete-page <scope> <pageId>

teams class-notebook type <teamId-or-groupId>
teams class-notebook default <teamId-or-groupId>
teams class-notebook export <teamId-or-groupId> --output ./class-notebook
teams class-notebook create <teamId-or-groupId> --input ./class-notebook.json --locale ja-jp
teams class-notebook add-member <teamId-or-groupId> <notebookId> students student@example.com
teams class-notebook remove-member <teamId-or-groupId> <notebookId> students student@example.com
teams class-notebook teacher-only <teamId-or-groupId> <notebookId>
teams class-notebook delete <teamId-or-groupId> <notebookId>
```

`<scope>` accepts a Teams thread ID, Microsoft 365 group ID, `me`, `user:<userId>`, or `site:<hostname,siteCollectionId,siteId>`. Exports include nested section groups, page HTML, image/file resources, and an `index.json` manifest. A single `download-page` saves raw HTML; use `export` for a local copy with resources. Export creates new files and does not overwrite an earlier export.

For an attachment named `file1`, reference `name:file1` in your page HTML, for example `<object data="name:file1" data-attachment="report.pdf" type="application/pdf"></object>`. The repeated `--attachment partName=path` option is also supported by `patch-page`.

Example `commands.json` for page editing:

```json
[{ "target": "body", "action": "append", "content": "<p>New note</p>" }]
```

Example `class-notebook.json`:

```json
{
  "name": "Class Notebook",
  "studentSections": ["Handouts", "Homework"],
  "teachers": [{ "id": "teacher@example.com", "principalType": "Person" }],
  "students": [{ "id": "student@example.com", "principalType": "Person" }],
  "hasTeacherOnlySectionGroup": true
}
```

`class-notebook copy-sections`, `distribute-page`, `sync-membership`, and `repair` support classroom administration. For `distribute-page`, supply `--input` with `studentUserPrincipalName`, `targetSectionName`, and an ISO `lockStartDate`; `assignmentId` and `ignoreIfStudentPageExists` are optional. `notebooks lock-page` accepts an ISO date or `null` to clear the lock. Notebook/page/section copying returns an operation URL; `notebooks operation <operationUrl>` checks its status.

Class Notebook administration requires the corresponding teacher/owner permissions. In the supplied HAR account, the class-specific list endpoint returned 403, while the default notebook, ordinary notebook list, pages, and resources were readable. Use `class-notebook default` or `notebooks list` when class-specific metadata is unavailable. Ordinary notebook or section deletion/renaming is not fully exposed by the OneNote REST API: use the file APIs for their SharePoint storage item; section renaming and page editing/deletion have dedicated notebook commands. Page deletion through OneNote is permanent.

Run `teams files --help`, `teams notebooks --help`, or `teams class-notebook --help` for all commands. Commands can change or delete server data immediately when invoked.

#### Common options

- `--json`: output only JSON
- `--no-color`: disable ANSI colors
- `--profile=<name>`: use another local profile name
- `--profile-json=<path>`: use a custom profile JSON file
- `--ests-auth-persistent=<token>`: set session token for current run (recommended)
- `--refresh-token=<token>`: set refresh token for current run (deprecated)
- `--help`: show help

## MCP server

The stdio MCP server exposes exactly one tool, `teams`. Its description includes every CLI command's syntax and explanation, global options, argument conventions, and JSON input formats for notebook editing and administration.

Run from source:

```bash
bun run teams -- mcp
bun run teams -- mcp --profile work
# Alias: bun run mcp
```

After building, run `node dist/cli/index.mjs mcp`. The published package starts with `teams mcp`; `teams-mcp` is also available as an alias. Use the same CLI authentication profile; run `teams login` before connecting, or supply the authentication environment variables to the MCP process.

Example MCP client configuration for a local checkout:

```json
{
  "mcpServers": {
    "teams": {
      "command": "node",
      "args": ["/absolute/path/to/teams-api/dist/cli/index.mjs", "mcp", "--profile", "default"]
    }
  }
}
```

Call the `teams` tool with an argument array, excluding the executable name:

```json
{ "args": ["notifications", "--limit", "10"] }
```

```json
{ "args": ["files", "download", "drive-id", "item-id", "--output", "./report.pdf"] }
```

```json
{ "args": ["--profile", "work", "class-notebook", "export", "group-id", "--output", "./notebook"] }
```

Arguments are passed directly to the CLI without a shell. The server forces JSON output and returns CLI stdout as tool text, plus `structuredContent` containing `exitCode`, `stdout`, `stderr`, and `result` when stdout is JSON. CLI failures set `isError: true`. Help commands return text. Each call uses the existing CLI behavior, including server mutations and local file saves. Paths are relative to the MCP server's working directory. Calls execute sequentially to avoid concurrent refresh-token writes to a shared profile.

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
bun test
```

The package uses Vite+ to build both library and CLI entry points.

## License

MIT
