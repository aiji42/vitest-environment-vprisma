import { AsyncLocalStorage } from "node:async_hooks";
import { VPrismaError } from "./errors.ts";

type TxClient = {
  $executeRawUnsafe(query: string): PromiseLike<unknown>;
  /** Native nested transactions (savepoints through the driver adapter), in recent Prisma 7+. */
  $transaction?: (fn: () => Promise<unknown>) => Promise<unknown>;
};

const UNSUPPORTED = new Set<PropertyKey>(["$on", "$use", "$extends"]);
const RAW_QUERIES = new Set<PropertyKey>([
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
]);

/**
 * Wrap Prisma's interactive-transaction client so that it behaves like a full PrismaClient running
 * in autocommit mode:
 * - `$transaction` becomes a nested transaction (a SAVEPOINT that is rolled back on failure).
 * - Each query issued outside such a nested transaction runs in its own SAVEPOINT, so a failing
 *   statement does not abort the whole test transaction (PostgreSQL "current transaction is aborted").
 * - Connection management is a no-op.
 *
 * With `savepoints: false`, nested transactions and queries run directly in the test transaction.
 */
export function createTestClient<Client>(tx: TxClient, savepoints: boolean): Client {
  // Set while running inside a nested transaction (or batch), whose own SAVEPOINT already applies.
  const insideNested = new AsyncLocalStorage<true>();
  // All statements share one connection, so top-level units of work must run one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  let savepointSeq = 0;

  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    if (insideNested.getStore()) return fn();
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  // Prefer Prisma's own nested transactions: the driver adapter issues SAVEPOINT with the right
  // protocol (MySQL rejects SAVEPOINT as a prepared statement, which $executeRawUnsafe uses).
  const nativeNested = typeof tx.$transaction === "function" ? tx.$transaction.bind(tx) : undefined;

  const withSavepoint = async <T>(fn: () => PromiseLike<T>): Promise<T> => {
    if (!savepoints) return fn();
    if (nativeNested) return nativeNested(async () => await fn()) as Promise<T>;
    const name = `vprisma_sp_${++savepointSeq}`;
    await execSavepoint(tx, `SAVEPOINT ${name}`);
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      await execSavepoint(tx, `ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
    await execSavepoint(tx, `RELEASE SAVEPOINT ${name}`);
    return result;
  };

  const $transaction = (arg: unknown): Promise<unknown> => {
    let body: () => Promise<unknown>;
    if (typeof arg === "function") {
      body = async () => arg(proxy);
    } else if (Array.isArray(arg)) {
      body = async () => {
        const results: unknown[] = [];
        for (const query of arg) results.push(await query);
        return results;
      };
    } else {
      throw new TypeError("$transaction expects a callback or an array of Prisma queries");
    }
    return serialize(() => withSavepoint(() => insideNested.run(true, body)));
  };

  // Defer a lazy PrismaPromise until it is awaited, then run it in its own SAVEPOINT.
  const wrapQuery = (query: unknown): unknown => {
    if (!savepoints || !isThenable(query)) return query;
    let result: Promise<unknown> | undefined;
    const run = () => {
      // Inside a nested transaction a failing query fails that transaction, as it would for real.
      result ??= insideNested.getStore()
        ? Promise.resolve(query)
        : serialize(() => withSavepoint(() => query));
      return result;
    };
    return new Proxy(query, {
      get(target, prop) {
        if (prop === "then") return (ok?: Fn, ng?: Fn) => run().then(ok, ng);
        if (prop === "catch") return (ng?: Fn) => run().catch(ng);
        if (prop === "finally") return (fn?: () => void) => run().finally(fn);
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  const wrapFunction =
    (fn: Fn, thisArg: unknown): Fn =>
    (...args) =>
      wrapQuery(fn.apply(thisArg, args));

  const delegates = new Map<PropertyKey, unknown>();
  const wrapDelegate = (prop: PropertyKey, delegate: object): unknown => {
    let wrapped = delegates.get(prop);
    if (!wrapped) {
      wrapped = new Proxy(delegate, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? wrapFunction(value, target) : value;
        },
      });
      delegates.set(prop, wrapped);
    }
    return wrapped;
  };

  const proxy = new Proxy(tx, {
    get(target, prop) {
      if (prop === "$transaction") return $transaction;
      if (prop === "$connect" || prop === "$disconnect") return async () => {};
      if (UNSUPPORTED.has(prop)) {
        throw new VPrismaError(
          "E_UNSUPPORTED_ON_TEST_CLIENT",
          `\`${String(prop)}\` is not available on vPrisma.client because it is bound to a transaction. ` +
            `Apply \`${String(prop)}\` to the client inside the factory passed to createVPrisma() instead.`,
        );
      }
      const value = Reflect.get(target, prop, target);
      if (RAW_QUERIES.has(prop) && typeof value === "function") return wrapFunction(value, target);
      if (typeof prop === "string" && !prop.startsWith("$") && isObject(value)) {
        return wrapDelegate(prop, value);
      }
      return value;
    },
  }) as Client;
  return proxy;
}

// biome-ignore lint/suspicious/noExplicitAny: generic passthrough
type Fn = (...args: any[]) => any;

const isObject = (value: unknown): value is object =>
  (typeof value === "object" || typeof value === "function") && value !== null;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  isObject(value) && typeof (value as { then?: unknown }).then === "function";

async function execSavepoint(tx: TxClient, sql: string): Promise<void> {
  try {
    await tx.$executeRawUnsafe(sql);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.trim().split("\n").at(-1) : String(cause);
    throw new VPrismaError(
      "E_SAVEPOINT_FAILED",
      `Failed to run \`${sql}\`: ${reason}. ` +
        "If your database does not support standard SAVEPOINT syntax (e.g. SQL Server, MongoDB), " +
        "use createVPrisma(factory, { savepoints: false }).",
      { cause },
    );
  }
}
