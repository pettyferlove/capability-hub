# Repository Guidelines

## Project Overview

`capability-hub` is a self-hosted hub that receives, reviews, publishes, and distributes reusable
Agent Skills/assets to clients over HTTP, MCP, and a CLI. One Node process serves the React web UI,
the JSON API, `/mcp`, and (optionally) the background worker; content arrives from configured
sources (Git), passes an intake/publication workflow with RBAC, and is served back as versioned
releases.

pnpm monorepo, ESM, strict TypeScript, Express + React; AI workflows use Mastra.

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
- **Errors:** Hub layers throw `HubError(status, code, message, details, retryable)` /
  `fail()` from `packages/domain/src/errors.ts`; one handler
  (`apps/server/src/http/middleware/error-handler.ts`) maps `ZodError`→422, PG unique→409,
  standalone `AiError`→safe Hub HTTP errors, oversized body→413, unknown→500 with `{error:{code,message,request_id,retryable,details}}`.
- **Concurrency safety:** mutating commands use `Idempotency-Key` plus `ETag`/`If-Match` revision
  checks (`withRevision`, `packages/application/src/shared/revision.ts`); conflicts are 409/412/428,
  never silent last-write-wins.
- **Worker:** exactly one, `apps/server/src/workers/hub-worker.ts` — 1s tick, single-flight guard,
  claims jobs with a lease, renews every 20s. Content jobs retain backoff `[30s,120s,600s]` and max 3 attempts; AI uses one separate slot in the same Worker, with durable resume and no automatic provider-failure retry. See [AI framework](documents/design/ai-framework.md).
- **Web:** no state library. `shared/api/client.ts` is the only transport (auto `X-CSRF-Token`,
  auto `Idempotency-Key`, 401 → `hub:unauthenticated`); `shared/api/use-query.ts` supplies
  `useQuery`; session lives in `HubCtx`; routing is history-based via `app/use-app-route.ts`.
- **CLI:** `bin/capability-hub.mjs` → `apps/cli/src/cli.ts` (`parseArgs` dispatch over a typed fetch
  client). It writes downloaded content only to explicit paths and never executes it.

## Key Directories

| Path                                                            | Purpose                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/server/src`                                               | HTTP/MCP routes, bootstrap, config, workers, observability, `http/routes` thin                  |
| `apps/web/src`                                                  | `app/` shell, `features/<domain>/`, `shared/{api,components,icons,styles,…}`                    |
| `apps/cli/src`                                                  | CLI commands, API client, response schemas, install logic                                       |
| `packages/contracts/src`                                        | zod schemas and boundary types shared by server/web/cli                                         |
| `packages/domain/src`                                           | Records, RBAC, `HubError`, canonical JSON, async helpers                                        |
| `packages/application/src`                                      | Use cases per domain (`identity`, `catalog`, `intake`, `publication`, `sources`,…) and `ports/` |
| `packages/infrastructure/src`                                   | SQLite/PostgreSQL stores, content/blob storage, git, security, scanning                         |
| `tests/{unit,integration,components,external,support,fixtures}` | Test suites and shared harnesses                                                                |
| `scripts/{build,checks,database,operations,setup,testing}`      | Tooling, one concern per directory                                                              |
| `documents/`                                                    | Implementation-first docs in Simplified Chinese (index: `documents/README.md`)                  |

## Development Commands

Setup: `nvm use && pnpm install --frozen-lockfile`, then `cp .env.example .env`. Defaults run on
SQLite (`CAPABILITY_HUB_DATA_DIR=.data`) with filesystem blob storage.

| Command                        | Does                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm dev`                     | server with `tsx` on `127.0.0.1:4100`                                                      |
| `pnpm dev:web`                 | Vite on `5173`, proxying to 4100                                                           |
| `pnpm build`                   | typecheck, build every package/app, compile ops scripts                                    |
| `pnpm start`                   | compiled `dist/main.js` (run `pnpm build` first)                                           |
| `pnpm typecheck`               | per-package `tsc --noEmit` + root config over `scripts/`, `tests/`                         |
| `pnpm lint` / `pnpm format`    | ESLint / Prettier (`format:check` in CI-equivalent gate)                                   |
| `pnpm test`                    | unit + integration + components                                                            |
| `pnpm test:external`           | Postgres/MinIO/SSH via local Docker                                                        |
| `pnpm check`                   | architecture → doc links → `db:check` → lint → format → build → test                       |
| `pnpm check:architecture`      | layering/exports/cycles/filename/`any` rules                                               |
| `pnpm db:generate`             | regenerate SQLite **and** PostgreSQL migrations                                            |
| `pnpm db:check` / `db:migrate` | verify migration tree / apply pending migrations                                           |
| `pnpm cli search --help`       | run the CLI from source (`connect, bridge, status, login, search, mcp-config, hub-config`) |

Operations: `pnpm backup`, `restore:import`, `restore:check`, `maintenance`, `account:recover`.
`maintenance --collect-blobs` and `account:recover` require stopped services / a TTY.

## Code Conventions & Common Patterns

- **Formatting:** Prettier — 2 spaces, single quotes, trailing commas, 100 columns; `.prettierrc.json`.
  ESLint is type-aware (`projectService`) with `consistent-type-imports` and `no-misused-promises`.
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
- **Comments/docs:** Simplified-Chinese comments for invariants and non-obvious reasons only;
  identifiers stay English. Source changes require updating the matching `documents/` chapter; each
  rule lives in one place, other sites link to it. Doc links in `README.md`, `AGENTS.md`, and
  `documents/**` are validated by `pnpm check:documentation`.
- **Dependencies:** internal deps are `workspace:*` only; shared versions come from the `catalog:` in
  `pnpm-workspace.yaml`. Exports need `development` → `src/*.ts`, `types`/`default` → `dist/*`.

## AI Tooling and Specifications

These rules apply to every contributor, regardless of which AI tools are installed locally.
The examples below do not adopt or require a Specification-Driven Development (SDD) framework.
Use the repository's established workflow or the user's authorized adoption scope; discovering
a skill alone does not authorize installing, initializing, or upgrading its framework.

- **Shared tooling:** keep project-owned instructions, skills, configuration, templates, and
  supporting scripts eligible for version control, including `.agents/skills/`. Review generated
  files by purpose, not by their origin. Record the source/version and reproduction instructions
  for adopted tooling; keep personal installations and machine-specific settings out of commits.
- **Formal SDD artifacts:** when the repository adopts such a workflow, version its shared
  configuration, specifications, change proposals, designs, research, tasks, and archives in their
  native locations. Examples: OpenSpec's `openspec/config.yaml`, `openspec/specs/`, and
  `openspec/changes/` (including `archive/`); Spec Kit's shared `.specify/` constitution, templates,
  and scripts, plus `specs/<feature>/`. Draft status does not make these disposable process notes.
  Do not move them into local scratch space or ignore files merely named `proposal.md`, `plan.md`,
  `research.md`, or `tasks.md`.
- **Local process material:** ad hoc design exploration, scratch plans, investigation notes,
  progress records, caches, and temporary outputs belong in ignored `.agents/local/`.
  Existing exploratory Agent proposals live in `.agents/local/design/`; they are not adopted SDD
  specifications. Keep these materials out of commits and the formal documentation index.
- **Selective ignores:** never ignore `.agents/` or another AI tool directory wholesale. Add only
  specific local/cache paths when needed; keep shared skills and workflow artifacts visible.
  Tool-required local state outside `.agents/local/` needs an explicit, narrowly scoped rule.
  `.gitignore` does not untrack files: inspect staged paths and remove local artifacts from the
  index without deleting their working copies or disturbing unrelated staged changes.

When an SDD workflow is used:

1. Read the repository instructions, existing tool configuration, and selected change before
   generating files. Use one authoritative specification location per change; do not maintain
   competing copies in multiple frameworks. Review initialization and upgrade diffs for overwrites.
2. Derive specifications and templates from the existing architecture and engineering rules.
   Tool defaults must not relax package boundaries, RBAC, concurrency, persistence, or test rules.
   Keep proposed behavior distinct from implemented behavior and honor design-only task scope.
3. Maintain traceability between requirements, tasks, implementation, and validation. Run the
   configured workflow's validation and applicable repository checks; report unavailable tools or
   unrun checks explicitly. Synchronize accepted changes and preserve history using that workflow's
   completion/archive rules; do not mark abandoned or unverified work as implemented.
4. Review related specifications and implementation together when committing is authorized.
   Keep `documents/` focused on implemented behavior; link to authoritative specifications rather
   than duplicating their rules, and do not index local scratch material or unfinished proposals.

Upstream references: [OpenSpec tool integration](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md),
[OpenSpec concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md), and
[Spec Kit adoption](https://github.com/github/spec-kit/blob/main/docs/guides/existing-projects.md).

## Important Files

| File                                                  | Role                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| `package.json`                                        | every root script; engines; `bin`                 |
| `pnpm-workspace.yaml`                                 | workspaces, catalog, build policy                 |
| `tsconfig.base.json`                                  | `NodeNext`, `strict`, `verbatimModuleSyntax`, JSX |
| `eslint.config.mjs`, `.prettierrc.json`               | lint and format rules                             |
| `apps/server/src/main.ts`, `app.ts`                   | server entry and composition root                 |
| `apps/server/src/bootstrap/{hub-services,storage}.ts` | DI wiring and backend selection                   |
| `apps/server/src/config/server-config.ts`             | zod-validated env config                          |
| `packages/application/src/ports/`                     | port interfaces (the real extension points)       |
| `apps/web/src/main.tsx`, `app/App.tsx`                | web entry and shell                               |
| `bin/capability-hub.mjs` → `apps/cli/src/cli.ts`      | CLI entry                                         |
| `scripts/checks/check-architecture.ts`                | the enforced layering/bans matrix                 |
| `scripts/testing/run-tests.mjs`                       | test group runner                                 |
| `Dockerfile`, `compose.yaml`, `compose.local.yaml`    | production and local stacks                       |

## Runtime/Tooling Preferences

- Node **24.22.1** (`.nvmrc`, `engines`, Dockerfile) and pnpm **10.33.0**; `preinstall` aborts on any
  other package manager/version (`scripts/setup/require-pnpm.mjs`).
- ESM everywhere (`"type": "module"`); dev/test resolution uses `--conditions=development` + `tsx`
  so packages resolve to `src/*.ts`, while production resolves `dist`. Tests import `./x.js` for
  files that are `x.ts` on disk — do not "fix" these specifiers.
- No bundler for server/cli; Vite only for `apps/web`. drizzle-kit 0.31.11 is pinned for migrations.
- No CI config in-repo: `pnpm check` is the gate. Then `pnpm test:external`, `docker build`, and
  `pnpm test:image <tag>` for release confidence.
- `.env` is loaded by child processes via `--env-file-if-exists`; see
  `documents/reference/configuration.md`. Production needs `NODE_ENV=production`, HTTPS public URL,
  64-hex `CAPABILITY_HUB_INSTANCE_SECRET`, and `CAPABILITY_HUB_SETUP_TOKEN`.

## Testing & QA

- Runner is Node's built-in `node:test` via `scripts/testing/run-tests.mjs`; groups: `unit`
  (pure logic), `integration` (SQLite + use cases + `supertest` + MCP + CLI subprocess),
  `components` (jsdom + Testing Library), `external` (Postgres/MinIO/SSH through
  `compose.test.yaml`). An empty group is a hard error.
- Single file: `node --conditions=development --import ./scripts/testing/register-test-runtime.mjs --test tests/integration/oauth.test.ts`;
  add `--test-name-pattern="…"` to narrow.
- Reuse the harnesses: `createTestHub(context)`/`publishSkill` (`tests/support/application.ts`),
  `serveTestHub`, `httpClient`/`signIn` (`tests/support/http.ts`), `deferred()` for races,
  `migrationRuntime` for migration tests. Component tests must import `../support/dom.js` first and
  register `afterEach(cleanup)`; React is used without JSX.
- Cleanup is per-test `context.after(...)`: close the runtime, then remove temp dirs. Tests never
  share a database and never depend on order.
- Expectation: test observable behavior, failure paths, authorization, and concurrency. No coverage
  threshold. Do not assert private call counts, implementation strings, or DOM class names; do not
  synchronize with sleeps. `pnpm test:external` needs a local Docker `unix://` socket and refuses
  remote hosts.
- Report unrun checks explicitly: DOM tests do not prove layout/accessibility, and external or
  browser validation is a separate claim.

## Commit & PR Conventions

`<type>(<scope>): <summary>` — write the summary in the language the user or task uses; do not
force Simplified Chinese (or any fixed language), and keep identifiers, types, scopes, and standard
footer tokens verbatim. Scope lowercase and only when meaningful; `feat`, `fix`, `refactor`, `perf`,
`docs`, `test`, `build`, `ci`, `style`, `chore`, `revert` chosen by intent, never defaulting to
`feat`. Base messages on the staged diff only; no invented causes or issue IDs; subject ≤72 chars,
no emoji, no trailing period; `!` + `BREAKING CHANGE:` only for demonstrated breakage. PRs state
problem, resulting behavior, and validation; link issues, screenshot UI changes, and update
affected docs.
