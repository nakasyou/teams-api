# Repository Guidelines

## Project Structure & Module Organization

- `src/index.ts` exports the public library entrypoint.
- `src/cli/` contains the CLI app (`index.ts`, command parser, output, profile/auth options).
- `src/client/` contains `TeamsClient` and the high-level API object layout.
- `src/rest/` contains request scaffolding and API route functions in `routes/`.
- `src/auth/` handles token persistence and auth token exchange.
- `src/types/` stores shared response/argument types.
- `dist/` is generated build output for the published package.
- `skills/` stores integration metadata for AI agents.
- `vite.config.ts` and `tsconfig.json` are build/type configuration.

## Build, Test, and Development Commands

- `bun install` installs dependencies.
- `bun run cli -- --help` runs the CLI from source.
- `bun run teams -- --help` runs the same binary entry for parity checks.
- `bun run build` runs `vp pack` to compile library and CLI into `dist`.
- `bun run fmt` runs `vp fmt` (formatter/lint-like checks for style).

## Coding Style & Naming Conventions

- Use TypeScript strict mode; prefer explicit types and avoid `any`.
- Formatting follows this project’s setup: 2-space indentation, single quotes, and no semicolons.
- Use `camelCase` for variables/functions and `PascalCase` for classes/types/interfaces.
- Keep modules focused and colocate route logic under `src/rest/routes/*`.
- Prefer named exports for utility routes and API helpers.

## Testing Guidelines

- There is no dedicated test script in `package.json` today.
- Before opening a PR, run:
  - `bun run fmt`
  - `bun run build`
  - `bun run cli -- --help`
- For behavioral validation, run a local smoke command you changed (for example:
  `bun run teams me --json`) with valid credentials.
- If you add tests, follow `*.test.ts` or `*.spec.ts` naming and add a `bun test` script.

## Commit & Pull Request Guidelines

- Recent commits use Conventional Commit-style prefixes like `feat:` and `chore(release):`.
- Keep commit titles short, imperative, and scoped to one logical change.
- PRs should include summary, rationale, and test/verification results.
- Link related issues/tasks when available and describe auth-related impact.
- For user-visible behavior changes, mention command examples and breaking changes.

## Security & Configuration Tips

- Do not commit secrets (`.env*`, `session.json`) or raw auth tokens.
- Default token profile is under `~/.teams-cli/default.json`; use `--profile` for isolated environments.
- Confirm all hardcoded values are for docs/examples only before release.
