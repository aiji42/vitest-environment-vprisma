---
name: vitest-prisma
description: Set up and debug database tests that use vitest-prisma (each Vitest test runs in a Prisma transaction that is rolled back). Use when adding vitest-prisma to a project, writing tests that touch the database through Prisma, migrating from vitest-environment-vprisma, or when a test fails with a [vitest-prisma:E_*] error.
---

# vitest-prisma

vitest-prisma wraps `beforeEach` + test + `afterEach` in one Prisma interactive transaction and
rolls it back. Full docs: `node_modules/vitest-prisma/README.md`, error reference:
`node_modules/vitest-prisma/docs/errors.md`.

## Set up

1. Check requirements: `vitest >= 4.1`, Prisma `>= 6`, Node `>= 22.12`. Install with `-D vitest-prisma`.
2. Find how the project builds its `PrismaClient` (adapter, output path such as
   `src/generated/prisma/client`, `$extends`). If one module both creates and exports the shared
   instance, split it into a factory module (`createClient()`) and an instance module
   (`export const db = createClient()`). The setup file must import only the factory.
3. Create the setup file and register it in `test.setupFiles`:

   ```ts
   // vitest.setup.ts
   import { vi } from "vitest";
   import { createVPrisma } from "vitest-prisma";
   import { createClient } from "./src/client";

   export const vPrisma = createVPrisma(createClient);
   vi.mock("./src/db", () => ({ db: vPrisma.client })); // path of the shared-instance module
   ```

4. Make sure the test database has the schema (`prisma migrate deploy` or `prisma db push` in
   `globalSetup` or CI). vitest-prisma does not migrate.
5. SQLite: set `fileParallelism: false`.
6. Verify: write one test that creates a row and one that expects the table to be empty, then run them.

## Write tests

- Use `vPrisma.client` (imported from the setup file) or the application's mocked client inside
  `test` / `beforeEach` / `afterEach`. Do not clean up; everything is rolled back.
- Never use `vPrisma.client` in `beforeAll` / `afterAll` or at module top level. Use
  `vPrisma.originalClient` there, and clean up manually because those writes are not rolled back.
- Do not use `test.concurrent` / `describe.concurrent` in files that use the database.
- Asserting a DB error is fine: `await expect(createDuplicate()).rejects.toThrow()`, then keep querying.
- Debug the data a test leaves: add `vPrisma.configure({ rollback: false })` temporarily.

## Diagnose failures

Match the code in `[vitest-prisma:E_*]` and apply the fix from `docs/errors.md`:

| Code | Usual fix |
|---|---|
| `E_OUTSIDE_TEST` | Move the access into `test`/`beforeEach`, use `originalClient` in `beforeAll`, or await a leaked promise. |
| `E_CONCURRENT_TEST` | Remove `.concurrent` from the file. |
| `E_UNSUPPORTED_ON_TEST_CLIENT` | Move `$extends`/`$on`/`$use` into the factory. |
| `E_INVALID_CLIENT` | Make the factory return the client instance itself. |
| `E_SAVEPOINT_FAILED` | SQL Server/MongoDB: `savepoints: false`. Otherwise read `error.cause`. |

Other symptoms:

- `Cannot access 'vPrisma' before initialization`: the setup file imports the mocked module. Split
  factory and instance (Set up, step 2).
- Data leaks between tests: the code under test creates its own `PrismaClient` instead of using the
  mocked shared module. Mock that module too, or refactor it to use the shared client.
- `SQLITE_BUSY` / `database is locked`: set `fileParallelism: false`.
- Deadlocks or lock waits between test files: parallel files insert the same unique values. Make
  test data unique per file or test (for example, a random suffix).
