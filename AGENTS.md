# Repository Guidelines

## Project Structure & Module Organization

- `apps/server/src` contains Express HTTP/MCP endpoints and workers; `apps/web/src` contains React features, shared controls, and Tailwind utility compositions; `styles/` only contains theme, base, and animation CSS; `apps/cli/src` implements the consumer CLI.
- `packages/` separates contracts, domain rules, application use cases/ports, infrastructure adapters, and logging. Import workspace packages through declared exports; keep business rules in domain/application.
- `tests/` contains unit, integration, component, and external suites, with shared helpers in `support/` and assets in `fixtures/`.
- `scripts/` groups build, checks, database, operations, setup, and testing tooling; see [script inventory](documents/development/scripts.md); `deploy/` holds deployment helpers. Maintain engineering documentation in [documents/](documents/README.md).

## Build, Test, and Development Commands

Use Node.js **24.22.1** (`.nvmrc`) and pnpm **10.33.0**.

- `nvm use && pnpm install --frozen-lockfile`: select Node and install locked dependencies.
- `cp .env.example .env`: initialize local configuration.
- `pnpm dev`: start the server at `127.0.0.1:4100`; run `pnpm dev:web` separately for Vite at `127.0.0.1:5173`.
- `pnpm build`: type-check and compile packages, applications, and operations scripts; `pnpm start` runs compiled output.
- `pnpm db:generate`: generate SQLite and PostgreSQL migrations from their Drizzle schemas; review SQL and native constraints before applying.
- `pnpm db:migrate`: apply pending migrations using the configured database and the same locked, transactional runner as startup.
- `pnpm check`: run architecture, documentation-link, database-schema, ESLint, formatting, build, and default-test checks.

## Coding Style & Naming Conventions

Use strict TypeScript/ES modules, two-space indentation, single quotes, trailing commas, and Prettier's 100-column width. Run `pnpm format` for Prettier formatting (applied migration SQL and snapshots must remain unchanged) and `pnpm lint` for ESLint.

Use kebab-case TypeScript filenames and PascalCase React components. Name boundary types `Request`, `Query`, `Response`, `Command`, or `Record` according to their role. Validate external values from `unknown`; avoid explicit `any`. Write concise Simplified Chinese comments explaining invariants or non-obvious reasons. See [engineering conventions](documents/development/engineering.md).

## Testing Guidelines

Name tests `*.test.ts`. `pnpm test` runs Node's built-in test runner across unit, integration, and component suites; components use jsdom and Testing Library. `pnpm test:external` provisions isolated PostgreSQL, MinIO, and SSH Git services through local Docker.

Test observable behavior, failure paths, authorization, and concurrency; clean up fixtures. No numeric coverage threshold exists. Distinguish automated checks from browser/external validation and report unrun checks explicitly.

## Commit & Pull Request Guidelines

Base messages strictly on the staged diff or explicitly selected commit. Use `<type>(<scope>): <简体中文摘要>`; include a short, lowercase scope only when meaningful. Choose `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `style`, `chore`, or `revert` by semantic intent; never default to `feat`.

Write prose in Simplified Chinese, preserving technical terms, identifiers, type/scope, and standard footer tokens. Describe outcomes precisely; prefer subjects within 72 characters, without emojis or a trailing period. Add concise body bullets when needed, without repeating the subject.

Do not invent behavior, causes, motivations, issue IDs, or a shared purpose for unrelated changes. Treat branch names as supplementary context only. Use `!` and a `BREAKING CHANGE:` footer only for demonstrated incompatibility. When asked solely for a commit message, output only that message.

PRs should explain the problem, resulting behavior, and validation; link related issues, include screenshots for UI changes, and update affected documentation.

## Security & Configuration

Keep credentials in ignored `.env` files; exclude `.data/` and generated output. Preserve one complete initial Drizzle migration per database backend, then append reviewed changes without legacy-data migrations or compatibility fallbacks. See [database migrations](documents/development/database-migrations.md); retain native triggers, SQLite STRICT tables, and deferred foreign keys when reviewing generated SQL.
