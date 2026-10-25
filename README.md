[![CI](https://github.com/aiji42/vitest-environment-vprisma/actions/workflows/ci.yml/badge.svg)](https://github.com/aiji42/vitest-environment-vprisma/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/vitest-prisma.svg)](https://www.npmjs.com/package/vitest-prisma)

# vitest-prisma

Run every Vitest test in a Prisma transaction and roll it back automatically. Tests stay isolated
without truncating tables or re-seeding between tests.

- **Zero cleanup:** `beforeEach`, the test and `afterEach` share one transaction, which is rolled back afterwards.
- **Works with real application code:** swap your shared `PrismaClient` for the test client with `vi.mock`. Code that calls `$transaction` still gets real nested-transaction semantics through savepoints.
- **Any Prisma setup:** Prisma 6+, the `prisma-client` or `prisma-client-js` generator, any output path, any driver adapter, `$extends`.
- **Clear failures:** every error has a stable code and a [documented fix](./docs/errors.md).

> Formerly `vitest-environment-vprisma`. See the [migration guide](./docs/migration-from-vitest-environment-vprisma.md).

## Requirements

- Vitest **>= 4.1** (uses `aroundEach`)
- Prisma **>= 6**
- Node.js **>= 22.12**
- PostgreSQL, MySQL/MariaDB, SQLite or CockroachDB. SQL Server and MongoDB work with
  [`savepoints: false`](#options).

## Quick start

```bash
npm install -D vitest-prisma
```

**1. Create a setup file** that tells vitest-prisma how to build your client:

```ts
// vitest.setup.ts
import { createVPrisma } from "vitest-prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

export const vPrisma = createVPrisma(
  () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }),
);
```

**2. Register it** in your Vitest config:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

**3. Use `vPrisma.client` in tests.** Everything is rolled back after each test:

```ts
import { expect, test } from "vitest";
import { vPrisma } from "../vitest.setup";

const prisma = vPrisma.client;

test("creates a user", async () => {
  await prisma.user.create({ data: { email: "alice@example.com" } });
  expect(await prisma.user.count()).toBe(1);
});

test("starts from a clean database", async () => {
  expect(await prisma.user.count()).toBe(0);
});
```

The test database must already have your schema applied, for example with
`prisma migrate deploy` or `prisma db push` in Vitest `globalSetup` or in CI.

A complete, runnable project (SQLite, no services needed) is in [`examples/sqlite`](./examples/sqlite).

## Mocking a shared client

Most applications import one shared `PrismaClient`. Point that module at the test client in your
setup file:

```ts
// src/client.ts: the factory (NOT mocked)
export const createClient = () => new PrismaClient({ adapter: /* ... */ });

// src/db.ts: the shared instance used by application code (mocked in tests)
import { createClient } from "./client";
export const db = createClient();
```

```ts
// vitest.setup.ts
import { vi } from "vitest";
import { createVPrisma } from "vitest-prisma";
import { createClient } from "./src/client";

export const vPrisma = createVPrisma(createClient);

vi.mock("./src/db", () => ({ db: vPrisma.client }));
```

> [!IMPORTANT]
> The setup file must not import the module it mocks, directly or indirectly. Otherwise
> `vi.mock`'s factory runs before `vPrisma` is initialized. That is why the factory and the
> shared instance live in separate files.

## How it works

1. `createVPrisma()` registers an `aroundEach` hook for the test file. Called from a setup file,
   that means for every test file.
2. Before each test, it opens an interactive transaction (`$transaction(async (tx) => ...)`) on
   the client from your factory. `vPrisma.client` forwards to that transaction's client.
3. `beforeEach`, the test and `afterEach` run inside the transaction.
4. When the test finishes (pass, fail or timeout), the transaction is rolled back.

Inside the transaction, `vPrisma.client` behaves like a normal client:

- `$transaction(fn)` and `$transaction([...])` run inside a `SAVEPOINT`, so a failure rolls back
  only that nested transaction, as it would in production.
- Each standalone query runs inside its own `SAVEPOINT`, so a failing query (for example, a
  unique-constraint violation you assert with `rejects`) does not abort the rest of the test.
  Without this, PostgreSQL fails every later query with "current transaction is aborted".
- `$connect()` / `$disconnect()` are no-ops.

The client is created lazily on first use in each test file and disconnected after the file finishes.

## API

### `createVPrisma(factory, options?)`

Call it from a `setupFiles` module and export the result.

| Parameter | Type | Description |
|---|---|---|
| `factory` | `() => PrismaClient` | Builds the client. Called at most once per test file. Configure adapters, `log` and `$extends` here. |
| `options` | `VPrismaOptions` | Defaults for all test files (see below). |

Returns a `VPrisma` handle:

| Member | Description |
|---|---|
| `client` | Client bound to the current test's transaction. Usable in `test`, `beforeEach`, `afterEach` and in code they call. Throws [`E_OUTSIDE_TEST`](./docs/errors.md#e_outside_test) elsewhere. It is a stable reference you can store or pass to `vi.mock`. |
| `originalClient` | The underlying client, outside any transaction. **Not rolled back.** For `beforeAll` / `afterAll`. |
| `configure(options)` | Override `rollback` / `savepoints` for the current test file. Call it at the top level of the file. |

### Options

| Option | Default | Description |
|---|---|---|
| `rollback` | `true` | `false` commits each test's transaction instead. Useful for inspecting data while debugging. |
| `savepoints` | `true` | Use `SAVEPOINT`s for nested `$transaction` calls and standalone queries. Set `false` for SQL Server / MongoDB. |
| `transactionOptions.timeout` | `86_400_000` | Max lifetime (ms) of a test transaction. Prisma's 5s default is too short for tests, so in practice Vitest's `testTimeout` is the limit. |
| `transactionOptions.maxWait` | `10_000` | Max time (ms) to wait for a connection. |
| `transactionOptions.isolationLevel` | DB default | Isolation level of the test transaction. |

## Recipes

### Reference data for a whole file

`beforeAll` runs outside any test transaction. Use `originalClient` there and clean up yourself:

```ts
beforeAll(async () => {
  await vPrisma.originalClient.plan.create({ data: { id: "pro", name: "Pro" } });
});
afterAll(async () => {
  await vPrisma.originalClient.plan.delete({ where: { id: "pro" } });
});
```

For per-test data, use `beforeEach` with `vPrisma.client`. It is rolled back automatically.

### See the data a test wrote

```ts
vPrisma.configure({ rollback: false }); // this file only
```

### Log SQL

Configure logging in the factory: `new PrismaClient({ adapter, log: ["query"] })`.

### Only some tests use the database

Every test in a file covered by the setup file opens a transaction. To keep pure unit tests free
of database access, put them in a separate [Vitest project](https://vitest.dev/guide/projects)
that does not include the setup file.

### SQLite

SQLite allows one writer at a time. Set `fileParallelism: false` or give each worker its own
database file.

## Limitations

- Tests in the same file cannot run concurrently ([`E_CONCURRENT_TEST`](./docs/errors.md#e_concurrent_test)).
  Separate files run in parallel.
- `$extends`, `$on` and `$use` cannot be called on `vPrisma.client`. Apply them in the factory.
- Prisma's fluent relation API (`prisma.user.findUnique(...).posts()`) works, but the chained
  query does not get its own savepoint.
- Code that opens its own `PrismaClient` instead of using the mocked shared one is not isolated.

## For AI coding agents

This package is built to be used by coding agents as well as people:

- **Docs are shipped in the package.** `node_modules/vitest-prisma/README.md` and
  `node_modules/vitest-prisma/docs/` cover setup, API, migration and every error, with no network needed.
- **Agent Skill:** `node_modules/vitest-prisma/skills/vitest-prisma/SKILL.md` describes how to set
  up, write tests and debug failures. Copy it into `.claude/skills/` (or your agent's skills
  directory) to use it.
- **Errors are actionable.** Messages look like `[vitest-prisma:E_CODE] what happened + how to fix`
  and link to [docs/errors.md](./docs/errors.md).
- [`llms.txt`](./llms.txt) indexes the documentation.

## Acknowledgments

v1 was based on [`@quramy/jest-prisma`](https://github.com/Quramy/jest-prisma). Many thanks to
[@Quramy](https://github.com/Quramy) and its contributors.

## License

MIT
