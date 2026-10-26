# Error reference

Every error thrown by vitest-prisma is a `VPrismaError` whose message starts with
`[vitest-prisma:<CODE>]` and ends with a link to the matching section below. Branch on
`error.code` in code; search this file for the code when diagnosing a failure.

## E_OUTSIDE_TEST

**Cause:** `vPrisma.client` was accessed when no test transaction is open:

- in `beforeAll` / `afterAll`,
- at module top level (for example `const { user } = vPrisma.client`),
- from code that keeps running after its test has finished (an un-awaited promise, a timer).

**Fix:**

- Move the code into `test`, `beforeEach` or `afterEach`. These all run inside the test transaction.
- For per-file setup that must happen once, use `vPrisma.originalClient` in `beforeAll` and clean up
  in `afterAll`. These writes are **not** rolled back.
- Keep a reference to the client (`const prisma = vPrisma.client`), not to its properties.
- Make sure every query in the test is awaited.

## E_CONCURRENT_TEST

**Cause:** two tests in the same file ran at the same time (`test.concurrent`, `describe.concurrent`
or `sequence.concurrent: true`). All tests of a file share one client, and each test needs its own
transaction, so they cannot overlap.

**Fix:** remove `.concurrent` from files that use vPrisma. Different test files still run in
parallel, each in its own worker and transaction. To speed up one large file, split it into several files.

## E_UNSUPPORTED_ON_TEST_CLIENT

**Cause:** `$extends`, `$on` or `$use` was called on `vPrisma.client`. The test client wraps a
transaction, and Prisma does not support these methods on transaction clients.

**Fix:** apply them inside the factory you pass to `createVPrisma`:

```ts
export const vPrisma = createVPrisma(() =>
  new PrismaClient({ adapter, log: ["query"] }).$extends(myExtension),
);
```

If application code calls `$extends` on a shared client at import time, export the extended client
from your module and mock that export instead.

## E_INVALID_CLIENT

**Cause:** the factory passed to `createVPrisma` did not return an object with a `$transaction`
method.

**Fix:** return the client instance itself: `createVPrisma(() => new PrismaClient(...))`. Do not
return a promise, a module or a model delegate.

## E_SAVEPOINT_FAILED

**Cause:** a `SAVEPOINT` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT` statement failed.
vitest-prisma uses savepoints for nested `$transaction` calls and to isolate each standalone query.
The original database error is attached as `error.cause`.

When the transaction client supports nested `$transaction` natively (recent Prisma 7+),
vitest-prisma uses that instead and this error does not occur.

**Fix:**

- On MySQL with a Prisma 7 release whose transaction client lacks native nested transactions, the
  cause reads "This command is not supported in the prepared statement protocol". Upgrade Prisma.
  If you can't, use `savepoints: false`.
- On SQL Server or MongoDB, which have no standard `SAVEPOINT` syntax, disable savepoints:
  `createVPrisma(factory, { savepoints: false })`. A failed nested transaction then cannot be
  rolled back on its own.
- Otherwise, inspect `error.cause`. A common cause is the test transaction having already been
  closed by Prisma's transaction `timeout`. Raise it with
  `createVPrisma(factory, { transactionOptions: { timeout } })`.

## E_CONFIGURE_IN_TEST

**Cause:** `vPrisma.configure()` was called while a test was running. Its options apply to the
whole test file and are read when each test starts, so a call inside a test would silently change
every later test in the file.

**Fix:** call `vPrisma.configure()` once, at the top level of the test file. Calling it inside a
`describe` callback also affects the whole file. To use different options, put those tests in
another file.

## E_INVALID_TRANSACTION_ARGUMENT

**Cause:** `vPrisma.client.$transaction()` received something other than a callback or an array of
Prisma queries.

**Fix:** pass `async (tx) => { ... }` or `[prisma.a.create(...), prisma.b.update(...)]`. Query
arrays must hold un-awaited Prisma queries.

## Not a vitest-prisma error, but common

### `Cannot access 'vPrisma' before initialization` (from `vi.mock`)

The setup file imported the module it mocks (directly or through another import), so the
mock factory ran before `vPrisma` existed. Import the client *factory* from a module that is
not mocked, and mock only the module that holds the shared instance. See
[Mocking a shared client](../README.md#mocking-a-shared-client).

### `Transaction already closed` / `Transaction API error: Transaction ... timed out`

The test ran longer than `transactionOptions.timeout`, which defaults to 24 hours. You may have
lowered it, or the test leaked a query past its own end. Await every query, or raise the timeout.

### `Transaction failed due to a write conflict or a deadlock` / lock wait timeouts

Two test files running in parallel inserted the same unique value. Each holds its row lock
until its transaction rolls back, so they block each other. Make test data unique per file or per
test, or set `fileParallelism: false`.

### SQLite: `database is locked` / `SQLITE_BUSY`

SQLite allows only one writer at a time, and every test holds a write transaction. Set
`fileParallelism: false` in your Vitest config, or give each worker its own database file.
