# Contributing guide for agents (and humans)

vitest-prisma: runs each Vitest test in a Prisma transaction and rolls it back. The published
package is ESM-only and built from `src/` with tsdown.

## Layout

- `src/index.ts`: `createVPrisma()`. Registers `aroundEach` (per-test transaction) and `afterAll` (disconnect).
- `src/test-client.ts`: proxy over Prisma's transaction client (savepoints for nested `$transaction` and standalone queries).
- `src/errors.ts`: `VPrismaError` and its codes. **Every code must have a section in `docs/errors.md`.**
- `test/unit/`: unit tests against a fake client (`test/unit/fake-client.ts`). No database needed.
- `e2e/`: real-database tests. `e2e/run.test.ts` runs `e2e/fixtures/` through Vitest's Node API
  and checks each test's outcome. Fixture tests named `[fail] ...` must fail; all others must pass.
- `examples/sqlite/`: user-facing example; also run in CI.
- `docs/`, `skills/`, `README.md`: shipped in the npm package; keep them in sync with the code.

## Commands

```bash
pnpm install
pnpm lint            # biome (pnpm lint:fix to fix)
pnpm typecheck
pnpm test            # unit tests
pnpm build && pnpm check:package

# e2e: build first; E2E_DB = sqlite (default) | postgresql | mysql
pnpm build
pnpm --filter ./e2e generate
E2E_DB=sqlite pnpm --filter ./e2e db:push
E2E_DB=sqlite pnpm --filter ./e2e test
# other Prisma/Vitest versions, as in CI:
e2e/scripts/use-versions.sh <6|7|next> <4.1|5>

pnpm --filter ./examples/sqlite test
```

PostgreSQL/MySQL URLs default to `postgres:password@localhost:5432/vprisma_e2e` and
`root:password@localhost:3306/vprisma_e2e`. Override them with `DATABASE_URL`.

## Rules

- Commit messages follow Conventional Commits. semantic-release derives versions from them
  (tags: `vitest-prisma@x.y.z`).
- A user-visible behavior change needs updates to README.md, `skills/vitest-prisma/SKILL.md` and,
  for new errors, `docs/errors.md`.
- New error messages: `[vitest-prisma:E_CODE] <what happened>. <how to fix>`, through `VPrismaError`.
- Do not add runtime dependencies; the package relies only on Vitest and structural Prisma types.
- Prisma CLI refuses `--force-reset` from AI agents. Do not work around that; use `db push` on a fresh database.
