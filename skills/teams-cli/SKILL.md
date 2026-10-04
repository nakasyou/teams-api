---
name: teams-cli
description: Use this skill when users ask how to install, configure, and use the Microsoft Teams CLI from this project, including installation, authentication, commands, output formats, profiles, and troubleshooting.
---

# Teams CLI User Guide Skill

Use this skill when users ask for:

- Installation steps for `msteams`/`teams`
- First-time setup (refresh token and profile)
- Command usage examples
- JSON output usage for automation/LLM workflows
- Troubleshooting common runtime/auth issues

## 1) Installation (User-Facing)

Provide the install method that matches the user's environment.

### Run without global install

```bash
npx msteams
bunx msteams
deno run -A npm:msteams
pnpm dlx msteams
```

### Global install

```bash
npm i -g msteams
bun i -g msteams
deno install --global -A npm:msteams
pnpm i -g msteams
```

### Verify installation

```bash
teams --help
```

If command is not found, guide users to:

1. confirm the package manager install succeeded,
2. confirm global bin path is on `PATH`,
3. retry with runner form (`npx`, `bunx`, `pnpm dlx`) to isolate PATH issues.

## 2) Authentication and Profile Setup

The CLI requires a refresh token.

### Save session credentials to default profile

```bash
teams login --ests-auth-persistent=<your_cookie_token>
```

Default profile file:

- `~/.teams-cli/default.json`

### Use a named profile

```bash
teams --profile=work login --ests-auth-persistent=<your_cookie_token>
```

### Use a custom profile file path

```bash
teams --profile-json=/path/to/profile.json login --ests-auth-persistent=<your_cookie_token>
```

### One-off execution token

Users can pass a token with `--refresh-token=<token>` (or `REFRESH_TOKEN` environment variable when applicable).

## 3) Core Command Usage

Always provide concrete examples.

### Notifications

```bash
teams notifications
teams notifications --limit 50
```

### Conversation messages

```bash
teams messages <conversationId>
teams messages <conversationId> --limit 30
```

### Channel messages

```bash
teams channel messages <channelId>
teams channel messages <channelId> --limit 30
```

### Teams and channels

```bash
teams teams list
teams teams channels <teamId>
```

### Current user snapshot

```bash
teams me
```

### Files and notebooks

```bash
teams files drives <teamId-or-groupId>
teams files channel <teamId-or-groupId> <channelId>
teams files list <driveId> [folderItemId]
teams files download <driveId> <itemId> --output ./file.pdf
teams files download-folder <driveId> <folderItemId> --output ./downloads
teams files upload <driveId> <folderItemId> ./file.pdf
teams files rename <driveId> <itemId> new-name.pdf
teams files delete <driveId> <itemId>
teams notebooks list <teamId-or-groupId>
teams notebooks export <scope> <notebookId> --output ./notebook
teams notebooks create-page <scope> <sectionId> --input ./page.html
teams notebooks patch-page <scope> <pageId> --input ./commands.json
teams class-notebook default <teamId-or-groupId>
teams class-notebook export <teamId-or-groupId> --output ./class-notebook
```

- Use `teams files --help`, `teams notebooks --help`, and `teams class-notebook --help` for the complete command lists, including administrative operations.
- Team thread IDs are resolved to Microsoft 365 group IDs automatically. File operations use drive/item IDs returned by discovery commands.
- Notebook scopes accept team/group IDs, `me`, `user:<id>`, and `site:<hostname,siteCollectionId,siteId>`.
- Full notebook export saves page HTML, resources, and `index.json`; OneNote packages are not ordinary downloadable files.
- Downloads refuse to overwrite existing local files. Uploads default to conflict failure; use `--conflict replace` or `rename` explicitly.
- Match mutations to the user's requested scope. File deletion, notebook page deletion, and Class Notebook membership changes modify remote data.
- Class-specific list/administration endpoints can return 403 when permissions are unavailable. The default notebook and ordinary notebook APIs may remain readable.

### MCP server

- Start `teams mcp` (alias: `teams-mcp`; from source: `bun run teams -- mcp`) for stdio MCP access.
- The server exposes exactly one `teams` tool. Its description documents the complete command set.
- Pass literal CLI arguments in `args`, excluding the executable name: `{"args":["files","list","drive-id"]}`.
- Put global profile options before the subcommand. The existing CLI profiles and authentication environment variables are reused.
- Tool results include the CLI output, exit code, stderr, and parsed JSON when available. Nonzero exits are tool errors.
- Download/upload/input paths refer to the MCP server machine and working directory.

## 4) Output Modes and Automation Guidance

### JSON mode (recommended for scripts/LLMs)

```bash
teams --json notifications
teams --json me
```

Guideline:

- Prefer `--json` when output is parsed programmatically.
- In automation contexts, avoid relying on colored/human-formatted text.

### Human-readable mode

Default mode in interactive terminals shows formatted output.

### Disable colors

```bash
teams --no-color notifications
```

Useful for plain logs and CI systems that do not handle ANSI escapes well.

## 5) Recommended Answer Pattern for Users

When supporting a user, structure responses as:

1. **Goal**: what command achieves.
2. **Command**: copy-paste example.
3. **Expected output**: what they should see.
4. **Next step**: likely follow-up command.
5. **Troubleshooting**: one or two relevant pitfalls.

Keep examples realistic (include `--limit`, profile selection, and JSON mode where useful).

## 6) Common Troubleshooting

### "Authentication failed" or token-related errors

- Re-run login using `login --ests-auth-persistent=<token>`.
- Confirm correct profile (`--profile`) is being used.
- If token is stale/expired, obtain a fresh refresh token and store it again.

### "Command not found: teams"

- Reinstall globally or run via `npx msteams` / `bunx msteams`.
- Ensure package manager global bin directory is on `PATH`.

### Empty results (no notifications/messages)

- Verify account has accessible Teams data.
- Increase `--limit`.
- Confirm correct `conversationId` / `channelId`.

## 7) Scope Guardrail

Keep this skill focused on end-user CLI operation:

- installation
- authentication setup
- command usage
- output/automation best practices
- troubleshooting

If the user asks for internal API/library modifications, switch to a development-oriented workflow instead of this skill.
