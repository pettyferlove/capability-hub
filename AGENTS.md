# Repository Guidelines

## Project Overview

`capability-hub` is a self-hosted hub that receives, reviews, publishes, and distributes reusable
Agent Skills/assets to clients over HTTP, MCP, and a CLI. One Node process serves the React web UI,
the JSON API, `/mcp`, and (optionally) the background worker; content arrives from configured
sources (Git), passes an intake/publication workflow with RBAC, and is served back as versioned
releases.

pnpm monorepo, ESM, strict TypeScript, Express + React; AI workflows use Mastra.

## Change Scope

- Change only the files and lines the task requires. Do not refactor, reformat, rename, rewrite
  existing comments, or upgrade dependencies as a side effect.
- If a reviewer would ask "how does this relate to the task?", leave it unchanged.
- Report out-of-scope findings (bugs, smells, stale docs) in the final reply; do not fix them.

## Architecture & Data Flow

Dependency direction is a whitelist enforced by `scripts/checks/check-architecture.ts`
(`permittedDependencies`). Additions fail `pnpm check` unless the matrix and the target package's
`exports` map are updated too.

| Package          | May import                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| `contracts`      | nothing (zod wire schemas + DTO types; no Node runtime concerns)                      |
| `domain`         | nothing (records, RBAC, errors, canonical JSON, digests)                              |
| `application`    | `domain` (use cases + port interfaces)                                                |
| `ai`             | nothing in this workspace (Mastra runtime, governance and ports)                      |
| `hub-agents`     | `ai`, `application`, `domain`                                                         |
| `infrastructure` | `ai`, `contracts`, `domain`, `application` (adapters)                                 |
| `server`         | `ai`, `hub-agents`, `application`, `infrastructure`, `contracts`, `domain`, `logging` |
| `cli`            | `contracts`, `domain`, `infrastructure`                                               |
| `web`            | `contracts`, `logging` (browser entry only)                                           |
| `logging`        | standalone (`./server` and `./browser` entries)                                       |

Cross-package imports must go through declared `exports`; relative paths across packages, package
cycles, and `web/src/shared` → `web/src/features` imports are rejected.

- **Composition root:** `apps/server/src/app.ts` (`createApp`) opens storage, builds `HubServices`
  (`apps/server/src/bootstrap/hub-services.ts`), the single worker, middleware, then ~16
  `register*Routes` calls, the 404 fallback, and the error handler. `main.ts` owns config, logging,
  signals, and a 60s shutdown deadline.
- **HTTP flow:** route parses with a zod schema → `IdempotencyService.execute` inside `store.tx` →
  use case validates policy/evidence/authorization → adapter writes. Example:
  `apps/server/src/http/routes/publication-routes.ts` →
  `packages/application/src/publication/publication-service.ts`.
- **MCP flow:** `apps/server/src/http/routes/mcp-routes.ts` creates a per-request stateless server;
  `apps/server/src/integrations/mcp.ts` gates `contribution` tools on `hub:contribute`, re-reads the
  principal per call, and returns protocol errors (`isError: true`) instead of HTTP statuses.
- **Errors:** Hub layers throw `HubError(status, code, message, details, retryable)` / `fail()` from
  `packages/domain/src/errors.ts`; one handler (`apps/server/src/http/middleware/error-handler.ts`)
  maps `ZodError`→422, PG unique→409, standalone `AiError`→safe Hub HTTP errors, oversized body→413,
  unknown→500 with `{error:{code,message,request_id,retryable,details}}`.
- **Concurrency safety:** mutating commands use `Idempotency-Key` plus `ETag`/`If-Match` revision
  checks (`withRevision`, `packages/application/src/shared/revision.ts`); conflicts are 409/412/428,
  never silent last-write-wins.
- **Worker:** one HubWorker claims ready AI and content jobs every second. They share 1–5 slots
  (`CAPABILITY_HUB_WORKER_CONCURRENCY`, default 5) and renew leases every 20s. Content jobs retain
  backoff `[30s,120s,600s]` and max 3 attempts. AI supports durable resume without automatic
  provider-failure retries. See [AI framework](documents/design/ai-framework.md).
- **Web:** no state library. `shared/api/client.ts` is the only transport (auto `X-CSRF-Token`, auto
  `Idempotency-Key`, 401 → `hub:unauthenticated`); `shared/api/use-query.ts` supplies `useQuery`;
  session lives in `HubCtx`; routing is history-based via `app/use-app-route.ts`.
- **CLI:** `bin/capability-hub.mjs` → `apps/cli/src/cli.ts` (Commander commands, Clack terminal prompts).
  JSON/configuration/MCP use stdout; prompts use stderr. Downloads require explicit paths and never execute.

## Key Directories

| Path                                                                 | Purpose                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/server/src`                                                    | HTTP/MCP routes, bootstrap, config, workers, observability, `http/routes` thin                  |
| `apps/web/src`                                                       | `app/` shell, `features/<domain>/`, `shared/{api,components,icons,styles,…}`                    |
| `apps/cli/src`                                                       | CLI commands, API client, response schemas, install logic                                       |
| `packages/contracts/src`                                             | zod schemas and boundary types shared by server/web/cli                                         |
| `packages/domain/src`                                                | Records, RBAC, `HubError`, canonical JSON, async helpers                                        |
| `packages/application/src`                                           | Use cases per domain (`identity`, `catalog`, `intake`, `publication`, `sources`,…) and `ports/` |
| `packages/infrastructure/src`                                        | SQLite/PostgreSQL stores, content/blob storage, git, security, scanning                         |
| `tests/{unit,integration,components,external,live,support,fixtures}` | Test suites and shared harnesses                                                                |
| `scripts/{build,checks,database,operations,setup,testing}`           | Tooling, one concern per directory                                                              |
| `documents/`                                                         | Implemented behavior in Simplified Chinese (index: `documents/README.md`)                       |

## Development Commands

Run commands from the repository root. Setup: `nvm use && pnpm install --frozen-lockfile`, then
`cp .env.example .env`. Defaults run on SQLite (`CAPABILITY_HUB_DATA_DIR=.data`) with filesystem
blob storage.

| Command                        | Does                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm dev`                     | server with `tsx` on `127.0.0.1:4100`                                                      |
| `pnpm dev:web`                 | Vite on `5173`, proxying to 4100                                                           |
| `pnpm build`                   | typecheck, build every package/app, compile ops scripts                                    |
| `pnpm start`                   | compiled `dist/main.js` (run `pnpm build` first)                                           |
| `pnpm typecheck`               | per-package `tsc --noEmit` + root config over `scripts/`, `tests/`                         |
| `pnpm lint` / `pnpm format`    | ESLint / Prettier (`format:check` in CI-equivalent gate)                                   |
| `pnpm test`                    | unit + integration + components                                                            |
| `pnpm test:external`           | Postgres/MinIO/SSH/OpenLDAP via local Docker                                               |
| `pnpm check`                   | architecture → doc links → `db:check` → lint → format → build → test                       |
| `pnpm check:architecture`      | layering/exports/cycles/filename/`any` rules                                               |
| `pnpm db:generate`             | regenerate SQLite **and** PostgreSQL migrations                                            |
| `pnpm db:check` / `db:migrate` | verify migration tree / apply pending migrations                                           |
| `pnpm cli search --help`       | run the CLI from source (`connect, bridge, status, login, search, mcp-config, hub-config`) |

Operations: `pnpm backup`, `restore:import`, `restore:check`, `maintenance`, `account:recover`.
`maintenance --collect-blobs` and `account:recover` require stopped services / a TTY.

## Code Conventions & Common Patterns

- **Formatting:** Prettier — 2 spaces, single quotes, trailing commas, 100 columns; `.prettierrc.json`.
  ESLint is type-aware (`projectService`) with `consistent-type-imports`, `no-misused-promises`, and `no-deprecated`.
- **Hard bans** (`scripts/checks/check-architecture.ts`, `scripts/checks/lib/style-policy.ts`):
  explicit `any`; non-kebab `.ts` / non-Pascal `.tsx` filenames; imports after module body; Node
  builtins or `logging/server` in browser entries; hex/RGB/OKLCH or Tailwind palette colors outside
  `apps/web/src/styles/theme.css`; concatenated Tailwind class names.
- **Naming:** boundary types `…Request`/`…Query` (input), `…Response` (output), `…Command`/`…Query`
  (use cases), `…Record` (persisted row); schemas mirror types in camelCase
  (`submitPublicationRequestSchema`); classes `XService`, `XProcessor`, `XAdapter`. Wire and DB
  fields are `snake_case`, TS locals `camelCase`.
- **Validation:** external input starts as `unknown` and passes zod `.strict()` at the boundary;
  DB rows go through `parseRecord`. Some routes (`lifecycle-routes.ts`) pass `req.body` into services
  that validate internally — check the service before assuming edge validation.
- **DI:** plain constructor injection, no container or decorators. Application services take
  `ApplicationContext {store, blobs, identity}` plus explicit collaborators; wiring lives only in
  `hub-services.ts`, and no use case reaches back into `HubServices`.
- **Async:** `async/await` only; deliberate `void` for fire-and-forget; `Promise.allSettled` +
  `AggregateError` for teardown; `filterAsync`/`someAsync` from `packages/domain/src/async.ts`;
  `AbortSignal.timeout(30000)` for outbound calls.
- **Auth ordering:** `security.authenticate`/`csrf` are mounted mid-registration in `app.ts`; routes
  registered before them are anonymous by design. Never reorder blindly.
- **Data access:** only through `RecordStore`/`AiStore`/`BlobStorage`/`GitRepository` ports; `tx()` for
  atomic writes; no SQL in routes or use cases.
- **Web:** Tailwind CSS v4 utilities; long/reused combinations in `features/*/styles.ts` or
  `shared/styles/`, merged with `cn()`; colors, radii, and fonts only from `styles/theme.css`
  semantic variables; icons only via `shared/icons` (`AppIcon`, `lucide.ts`, `client-icons.ts`).
- **Migrations:** exactly one initial migration per backend; applied migrations are immutable —
  fixes require a new migration. Keep `--> statement-breakpoint`, SQLite `STRICT`, PostgreSQL
  `DEFERRABLE INITIALLY DEFERRED`, triggers; no `CREATE INDEX CONCURRENTLY`. Never reformat
  `migrations/` or `packages/contracts/schemas/` (SHA-256 compared by `db:check`).
- **Comments:** Simplified Chinese only for invariants, boundaries, and non-obvious reasons;
  identifiers stay English. Never describe what changed or why, never comment obvious code, and
  delete stale or restating comments. No empty "best practices", progress notes, or guarantees.
  Module-level `/** */` blocks start after one blank line; class and interface members stay dense.
  Keep one blank line after the import block and after a module-level block statement.
- **Dependencies:** internal deps are `workspace:*` only; shared versions come from the `catalog:` in
  `pnpm-workspace.yaml`. Exports need `development` → `src/*.ts`, `types`/`default` → `dist/*`.

## Documentation

`documents/` (index: `documents/README.md`) describes what the code does now, in Simplified Chinese.
`README.md` is the entry point. Aim for accurate and short, not comprehensive.

Change docs only when the task requires it, or when this change makes an existing statement wrong
(API, configuration, command, environment variable, interface contract). Do not create `.md` files
(including `SUMMARY.md`, `CHANGES.md`, `IMPLEMENTATION_NOTES.md`) or edit `CHANGELOG` unless the
task requires it.

- Replace stale text in place; delete the old wording instead of appending "previously… now…".
- Keep the edited section about the same length; if content must be added, delete the same amount of
  stale or duplicate text.
- State each fact once; link to the owning section instead of copying it.
- Omit change history, implementation narrative, design rationale, and generic "notes", "best
  practices", "FAQ", or "summary" sections.
- Omit what is already clear from code, type signatures, or configuration files.
- Doc links in `README.md`, `AGENTS.md`, and `documents/**` are validated by
  `pnpm check:documentation`.

## Testing

Runner is Node's built-in `node:test` (`scripts/testing/run-tests.mjs`); assertions use
`node:assert/strict`. Component tests add jsdom plus Testing Library (`@testing-library/react`,
`@testing-library/user-event`) through `tests/support/dom.js`. Groups: `unit` (pure logic),
`integration` (SQLite, use cases, `supertest`, MCP, CLI subprocess), `components` (React without
JSX), `external` (Postgres/MinIO/SSH/OpenLDAP via `compose.test.yaml` and `compose.ldap.yaml`), and `live` (real AI providers,
`pnpm test:ai:live`). An empty group is a hard error.

Add or change a test only when:

1. fixing a bug — one case that fails before the fix and passes after it;
2. adding or changing business logic with branches, computation, state transitions, or validation
   rules;
3. the task explicitly requires it.

Do not test getters/setters, records/DTOs, constants, pure delegation, simple configuration, or
framework behavior, and do not write tests to raise coverage.

- Put each file in the group directory that matches what it exercises, named `<domain>.test.ts`
  (for example `tests/integration/publication.test.ts`).
- Extend the existing per-domain test file with its harnesses and style instead of starting a second
  suite. Reuse `createTestHub`/`publishSkill` (`tests/support/application.ts`), `serveTestHub`,
  `httpClient`/`signIn` (`tests/support/http.ts`), `deferred()` for races, and `migrationRuntime`
  for migrations. Component tests import `../support/dom.js` first and register `afterEach(cleanup)`.
- One behavior per case, described by the risk it guards. Do not duplicate cases that differ only in
  input values; loop over a table instead.
- Assert results and observable behavior; never private call counts, call order, implementation
  strings, DOM class names, or sleeps. Mock only external boundaries, never the logic under test.
  Clean up per test with `context.after(...)`; tests never share a database and never depend on
  order.
- Single file:
  `node --conditions=development --import ./scripts/testing/register-test-runtime.mjs --test tests/integration/oauth.test.ts`
  (add `--test-name-pattern="…"` to narrow).
- When an existing test fails, decide whether the code or the requirement is wrong. Never change its
  assertion, delete the case, or mark it skipped to make it pass; if the requirement changed, update
  the test and say so in the reply.
- `pnpm test:external` needs a local Docker `unix://` socket and refuses remote hosts.

## AI Tooling and Specifications

These rules apply to every contributor, regardless of installed AI tooling. No Specification-Driven
Development (SDD) framework is adopted here; discovering a skill does not authorize installing,
initializing, or upgrading one. Use the repository's established workflow. Tool defaults must not
relax package boundaries, RBAC, concurrency, persistence, or test rules.

- Author Skills distributed to client Agents under `skills/<name>/SKILL.md` at the repository root.
  Keep project-owned contributor skills in `.agents/skills/` eligible for version control alongside
  shared instructions, configuration, and scripts. Review generated files by purpose and keep
  personal installations and machine-specific settings out of commits.
- Put ad hoc design exploration, scratch plans, investigation notes, progress records, caches, and
  temporary outputs in ignored `.agents/local/`; keep them out of commits and the documentation
  index. Existing exploratory proposals live in `.agents/local/design/`.
- If an SDD workflow is adopted, version its artifacts in their native locations (OpenSpec
  `openspec/`, Spec Kit `.specify/` and `specs/<feature>/`) and keep one authoritative specification
  location per change. Draft status does not make them disposable.
- Never ignore `.agents/` or another AI tool directory wholesale; add only specific local/cache
  paths. `.gitignore` does not untrack files: remove staged local artifacts from the index without
  deleting working copies or disturbing unrelated staged changes.

## Runtime/Tooling Preferences

- Node `>=24.22.0 <25` and pnpm `>=10.33.0 <11` (`engines`); `.nvmrc` selects 24.x. Dockerfile pins
  Node 24.22.1 and pnpm 10.33.0; `preinstall` rejects other package managers
  (`scripts/setup/require-pnpm.mjs`).
- ESM everywhere (`"type": "module"`); dev/test resolution uses `--conditions=development` + `tsx`
  so packages resolve to `src/*.ts`, while production resolves `dist`. Tests import `./x.js` for
  files that are `x.ts` on disk — do not "fix" these specifiers.
- Server uses tsc; CLI uses esbuild for a single bundle without runtime dependencies; Web uses Vite.
  drizzle-kit 0.31.11 is pinned for migrations.
- No CI config in-repo: `pnpm check` is the gate. Then `pnpm test:external`, `docker build`, and
  `pnpm test:image <tag>` for release confidence.
- `.env` is loaded by child processes via `--env-file-if-exists`; see
  `documents/reference/configuration.md`. Production needs `NODE_ENV=production`, an HTTP(S) public URL,
  64-hex `CAPABILITY_HUB_INSTANCE_SECRET`, and `CAPABILITY_HUB_SETUP_TOKEN`.

## Commit & PR Conventions

`<type>(<scope>): <summary>` — write the summary in the language the user or task uses; do not
force Simplified Chinese (or any fixed language), and keep identifiers, types, scopes, and standard
footer tokens verbatim. Scope lowercase and only when meaningful; `feat`, `fix`, `refactor`, `perf`,
`docs`, `test`, `build`, `ci`, `style`, `chore`, `revert` chosen by intent, never defaulting to
`feat`. Base messages on the staged diff only; no invented causes or issue IDs; subject ≤72 chars,
no emoji, no trailing period; `!` + `BREAKING CHANGE:` only for demonstrated breakage. PRs state
problem, resulting behavior, and validation; link issues, screenshot UI changes, and update docs
only as allowed by [Documentation](#documentation).

## Final Response

- List every changed file and why it changed.
- If docs changed: name the document and section, and say whether its length grew, shrank, or stayed
  the same.
- List out-of-scope problems found but not fixed, and docs or tests you recommend but did not add
  under these rules; the user decides.
- Report checks you did not run explicitly: DOM tests do not prove layout or accessibility, and
  external or browser validation is a separate claim.
