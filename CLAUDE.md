# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative references

`AGENTS.md` is the full contributor contract (conventions, bans, naming, commit format) — read it
before non-trivial changes; this file is a short orientation, not a replacement. `documents/`
(index: `documents/README.md`) documents implemented behavior in Simplified Chinese and must be
updated alongside source changes — `pnpm check:documentation` validates its links.

## Commands

```sh
nvm use && pnpm install --frozen-lockfile && cp .env.example .env   # setup (Node 24.22.1, pnpm 10.33.0)
pnpm dev            # server via tsx on 127.0.0.1:4100
pnpm dev:web        # Vite on 5173, proxies to 4100
pnpm check          # the gate: architecture → docs → db:check → lint → format:check → build → test
pnpm test           # unit + integration + components
pnpm test:external  # Postgres/MinIO/SSH through compose.test.yaml (needs a local Docker unix:// socket)
pnpm cli <cmd>      # run the CLI from source
```

There is no CI config in-repo. `pnpm check` is the gate; `pnpm test:external`, `docker build`, and
`pnpm test:image <tag>` add release confidence.

Single test file (the group runner has no file filter):

```sh
node --conditions=development --import ./scripts/testing/register-test-runtime.mjs \
  --test tests/integration/oauth.test.ts --test-name-pattern="…"
```

Database: `pnpm db:generate` regenerates **both** SQLite and PostgreSQL migrations;
`pnpm db:check` verifies the migration tree (SHA-256 over `migrations/` and
`packages/contracts/schemas/` — never reformat those); `pnpm db:migrate` applies pending ones.

Operations scripts: `pnpm backup`, `restore:import`, `restore:check`, `maintenance`,
`account:recover` (the last two need stopped services / a TTY).

## Architecture

pnpm monorepo, ESM, strict TypeScript, Express + React with no framework on top. One Node process
serves the React UI, the JSON API, `/mcp`, and the background worker.

Layering is a **whitelist** in `scripts/checks/check-architecture.ts` (`permittedDependencies`),
not a convention — a new cross-package import fails `pnpm check` until that matrix _and_ the target
package's `exports` map are updated:

| Package          | May import                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `contracts`      | nothing (zod wire schemas + DTO types)                            |
| `domain`         | nothing (records, RBAC, `HubError`, canonical JSON, digests)      |
| `application`    | `domain` (use cases + `ports/` interfaces)                        |
| `infrastructure` | `contracts`, `domain`, `application` (adapters)                   |
| `server`         | `application`, `infrastructure`, `contracts`, `domain`, `logging` |
| `cli`            | `contracts`, `domain`, `infrastructure`                           |
| `web`            | `contracts`, `logging` (browser entry only)                       |
| `logging`        | standalone (`./server` and `./browser` entries)                   |

Relative paths across packages, package cycles, and `web/src/shared` → `web/src/features` imports
are all rejected.

**Composition root** is `apps/server/src/app.ts` (`createApp`): open storage → build `HubServices`
(`apps/server/src/bootstrap/hub-services.ts`) → single worker → middleware → ~16 `register*Routes`
→ 404 → error handler. `main.ts` owns config, logging, signals, and the 60s shutdown deadline.
`packages/application/src/ports/` holds the real extension points.

**HTTP flow:** route parses with a zod schema → `IdempotencyService.execute` inside `store.tx` →
use case validates policy/evidence/authorization → adapter writes. Routes stay thin; no SQL in
routes or use cases — data access goes through the `RecordStore` / `BlobStorage` / `GitRepository`
ports only.

**MCP flow:** `apps/server/src/http/routes/mcp-routes.ts` builds a stateless per-request server;
`apps/server/src/integrations/mcp.ts` gates `contribution` tools on `hub:contribute`, re-reads the
principal per call, and returns `isError: true` protocol errors rather than HTTP statuses.

**Errors:** every layer throws `HubError` / `fail()` from `packages/domain/src/errors.ts`; the one
handler in `apps/server/src/http/middleware/error-handler.ts` maps `ZodError`→422, PG unique→409,
oversized body→413, unknown→500.

**Concurrency:** mutating commands combine `Idempotency-Key` with `ETag`/`If-Match` revision checks
(`withRevision`, `packages/application/src/shared/revision.ts`); conflicts surface as 409/412/428 —
never silent last-write-wins.

**Worker:** exactly one (`apps/server/src/workers/hub-worker.ts`) — 1s tick, single-flight guard,
leased job claims renewed every 20s, backoff `[30s,120s,600s]`, max 3 attempts.

**Web:** no state library. `shared/api/client.ts` is the only transport (auto `X-CSRF-Token`, auto
`Idempotency-Key`, 401 → `hub:unauthenticated`), `shared/api/use-query.ts` provides `useQuery`,
session lives in `HubCtx`, routing is history-based via `app/use-app-route.ts`.

**CLI:** `bin/capability-hub.mjs` → `apps/cli/src/cli.ts` (`parseArgs` over a typed fetch client).
It writes downloaded content only to explicit paths and never executes it.

## Things that bite

- Dev/test resolution relies on `--conditions=development` + `tsx` so packages resolve to `src/*.ts`
  while production resolves `dist`. Tests import `./x.js` for files that are `x.ts` on disk — do not
  "fix" those specifiers.
- `security.authenticate` / `csrf` are mounted **mid**-registration in `app.ts`; routes registered
  before them are anonymous by design. Never reorder blindly.
- Applied migrations are immutable: fix forward with a new migration. Keep `--> statement-breakpoint`,
  SQLite `STRICT`, PostgreSQL `DEFERRABLE INITIALLY DEFERRED`, and triggers; no
  `CREATE INDEX CONCURRENTLY`.
- `check-architecture.ts` also hard-bans explicit `any`, non-kebab `.ts` / non-Pascal `.tsx`
  filenames, imports after the module body, Node builtins or `logging/server` in browser entries,
  hex/RGB/OKLCH or Tailwind palette colors outside `apps/web/src/styles/theme.css`, and concatenated
  Tailwind class names.
- Some routes (e.g. `lifecycle-routes.ts`) pass `req.body` straight into services that validate
  internally — check the service before assuming edge validation.
- Internal deps are `workspace:*` only; shared versions come from the `catalog:` in
  `pnpm-workspace.yaml`. New package entries need `development` → `src/*.ts` plus `types`/`default`
  → `dist/*`.
- `.agents/local/` is ignored scratch space; never ignore `.agents/` wholesale — shared skills and
  workflow artifacts stay tracked.

## Testing

Runner is Node's built-in `node:test` via `scripts/testing/run-tests.mjs`. Groups: `unit` (pure
logic), `integration` (SQLite + use cases + `supertest` + MCP + CLI subprocess), `components`
(jsdom + Testing Library, React without JSX), `external` (Postgres/MinIO/SSH). An empty group is a
hard error.

Reuse the harnesses rather than hand-rolling: `createTestHub(context)` / `publishSkill`
(`tests/support/application.ts`), `serveTestHub`, `httpClient` / `signIn` (`tests/support/http.ts`),
`deferred()` for races, `migrationRuntime` for migration tests. Component tests import
`../support/dom.js` first and register `afterEach(cleanup)`. Cleanup is per-test `context.after(...)`;
tests never share a database or depend on order. Test observable behavior, failure paths,
authorization, and concurrency — not private call counts, implementation strings, DOM class names,
or sleeps.

## Comments, docs, commits

Simplified-Chinese comments only for invariants and non-obvious reasons; identifiers stay English.
Each rule lives in one place and other sites link to it. Commits are
`<type>(<scope>): <summary>` based on the staged diff only, summary in the language of the task,
≤72 chars, no emoji or trailing period; `!` + `BREAKING CHANGE:` only for demonstrated breakage.
