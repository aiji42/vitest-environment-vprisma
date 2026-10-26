/**
 * The minimal shape vitest-prisma needs from a Prisma client.
 * Any `PrismaClient` (Prisma 6+, any generator, any driver adapter, `$extends`-ed or not) satisfies it.
 */
export interface PrismaClientLike {
  // biome-ignore lint/suspicious/noExplicitAny: must accept every PrismaClient overload
  $transaction(...args: any[]): Promise<any>;
  $disconnect(): Promise<void>;
}

/** Options accepted by the outer interactive transaction (`PrismaClient.$transaction(fn, options)`). */
export interface TransactionOptions {
  /** Max time (ms) to wait for a connection from the pool. @default 5_000 */
  maxWait?: number;
  /**
   * Max time (ms) the per-test transaction may stay open.
   * Prisma's own default (5s) is too short for tests, so vitest-prisma raises it.
   * @default 86_400_000 (24h, i.e. effectively bounded by Vitest's testTimeout)
   */
  timeout?: number;
  /** Isolation level of the per-test transaction. Uses the database default when omitted. */
  isolationLevel?: string;
}

/** Behavior that can be overridden per test file with {@link VPrisma.configure}. */
export interface FileOptions {
  /**
   * Roll back the transaction after each test.
   * Set to `false` to commit instead (useful for inspecting data while debugging).
   * @default true
   */
  rollback?: boolean;
  /**
   * Use SAVEPOINTs to make the per-test transaction behave like a normal (autocommit) connection:
   * - `$transaction` called by the code under test becomes a real nested transaction: if it fails,
   *   only its own writes are rolled back.
   * - Each standalone query runs in its own SAVEPOINT, so a failing query (e.g. a unique-constraint
   *   violation you assert with `rejects`) does not abort the rest of the test on PostgreSQL.
   *
   * Works on PostgreSQL, MySQL/MariaDB, SQLite and CockroachDB. Set to `false` for databases
   * without standard SAVEPOINT syntax (SQL Server, MongoDB); nested transactions then run
   * directly in the test transaction.
   * @default true
   */
  savepoints?: boolean;
}

/** Options for {@link createVPrisma}. */
export interface VPrismaOptions extends FileOptions {
  /** Options for the per-test interactive transaction. */
  transactionOptions?: TransactionOptions;
}

/** The handle returned by {@link createVPrisma}. */
export interface VPrisma<Client extends PrismaClientLike> {
  /**
   * A client bound to the current test's transaction. Everything written through it is rolled
   * back when the test ends. Usable in `test`, `beforeEach`, `afterEach` and in code they call.
   * Accessing it in `beforeAll`/`afterAll` or at module top level throws `E_OUTSIDE_TEST`.
   *
   * It is a stable reference: pass it to `vi.mock` factories or keep it in a module-level constant.
   */
  readonly client: Client;
  /**
   * The underlying client, outside any transaction. Writes through it are NOT rolled back.
   * Use it only in `beforeAll`/`afterAll` (e.g. seeding reference data, then cleaning it up).
   */
  readonly originalClient: Client;
  /**
   * Override {@link FileOptions} for the current test file. Call it at the top level of a test
   * file; it is reset after the file finishes.
   * @example
   * ```ts
   * vPrisma.configure({ rollback: false });
   * ```
   */
  configure(options: FileOptions): void;
}
