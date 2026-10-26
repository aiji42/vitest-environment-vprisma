import { afterAll, aroundEach, expect } from "vitest";
import { VPrismaError } from "./errors.ts";
import { createTestClient } from "./test-client.ts";
import type { FileOptions, PrismaClientLike, VPrisma, VPrismaOptions } from "./types.ts";

export { VPrismaError, type VPrismaErrorCode } from "./errors.ts";
export type {
  FileOptions,
  PrismaClientLike,
  TransactionOptions,
  VPrisma,
  VPrismaOptions,
} from "./types.ts";

const DEFAULT_TIMEOUT = 86_400_000;
// Below Vitest's default hookTimeout (10s), so Prisma's pool-timeout error surfaces instead of a
// hook timeout.
const DEFAULT_MAX_WAIT = 5_000;

// Properties that tooling (vi.mock, util.inspect, expect, await) probes on arbitrary objects.
// They must not throw when accessed outside a test. Object.prototype members are allowed too.
const PROBED_PROPS = new Set<PropertyKey>([
  "then",
  "__esModule",
  "toJSON",
  "asymmetricMatch",
  "$$typeof",
  "nodeType",
  "inspect",
  "_isMockFunction",
]);

class RollbackSignal extends Error {}

/**
 * Per-worker state shared by every createVPrisma() call. With `isolate: false`, the setup file is
 * re-run for each test file while application modules (and the vPrisma.client they captured in
 * vi.mock) stay cached. Instances are matched to slots by call order within a file, so a stale
 * reference still reaches the current file's transaction.
 */
interface Slot {
  /** Client bound to the running test's transaction. */
  current: unknown;
  running: boolean;
  original: PrismaClientLike | undefined;
  fileOptions: FileOptions;
}
interface WorkerState {
  slots: Slot[];
  next: number;
  /** Test file whose setup is (or was last) running in this worker. */
  file: string | undefined;
}
const STATE_KEY = Symbol.for("vitest-prisma.state");
const globals = globalThis as Record<symbol, WorkerState | undefined>;
const workerState: WorkerState = globals[STATE_KEY] ?? {
  slots: [],
  next: 0,
  file: undefined,
};
globals[STATE_KEY] = workerState;

/**
 * Wrap every test of the current test file in a Prisma transaction that is rolled back when the
 * test finishes. Call it from a Vitest `setupFiles` module and export the result.
 *
 * @param factory Creates the PrismaClient to use. Called lazily, once per test file; the client is
 *   disconnected after the file finishes. Configure adapters, logging and `$extends` here.
 * @param options Defaults for every test file. See {@link VPrismaOptions}.
 *
 * @example
 * ```ts
 * // vitest.setup.ts  (listed in `test.setupFiles`)
 * import { createVPrisma } from "vitest-prisma";
 * import { PrismaPg } from "@prisma/adapter-pg";
 * import { PrismaClient } from "./src/generated/prisma/client";
 *
 * export const vPrisma = createVPrisma(
 *   () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }),
 * );
 *
 * // example.test.ts
 * import { vPrisma } from "../vitest.setup";
 *
 * test("creates a user", async () => {
 *   await vPrisma.client.user.create({ data: { email: "a@example.com" } });
 *   expect(await vPrisma.client.user.count()).toBe(1); // rolled back afterwards
 * });
 * ```
 */
export function createVPrisma<Client extends PrismaClientLike>(
  factory: () => Client,
  options: VPrismaOptions = {},
): VPrisma<Client> {
  const { transactionOptions, ...defaultFileOptions } = options;
  const slot = takeSlot();

  const getOriginal = (): Client => {
    if (slot.original) return slot.original as Client;
    const client = factory();
    if (typeof client?.$transaction !== "function") {
      throw new VPrismaError(
        "E_INVALID_CLIENT",
        "The factory passed to createVPrisma() must return a PrismaClient instance.",
      );
    }
    slot.original = client;
    return client;
  };

  // The connection wait happens in aroundEach's setup phase, which Vitest bounds by hookTimeout.
  const hookTimeout =
    transactionOptions?.maxWait === undefined ? undefined : transactionOptions.maxWait + 10_000;

  aroundEach(async (runTest) => {
    if (slot.running) {
      throw new VPrismaError(
        "E_CONCURRENT_TEST",
        "Tests in the same file cannot run concurrently with vitest-prisma because they would share " +
          "one transaction. Remove `.concurrent` / `sequence.concurrent` for files that use vPrisma.",
      );
    }
    slot.running = true;
    const { rollback = true, savepoints = true } = {
      ...defaultFileOptions,
      ...slot.fileOptions,
    };
    try {
      await getOriginal().$transaction(
        async (tx: Parameters<typeof createTestClient>[0]) => {
          slot.current = createTestClient<Client>(tx, savepoints);
          try {
            await runTest();
          } finally {
            slot.current = undefined;
          }
          if (rollback) throw new RollbackSignal();
        },
        {
          maxWait: DEFAULT_MAX_WAIT,
          timeout: DEFAULT_TIMEOUT,
          ...transactionOptions,
        },
      );
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    } finally {
      slot.running = false;
    }
  }, hookTimeout);

  afterAll(async () => {
    workerState.next = 0;
    workerState.file = undefined;
    slot.fileOptions = {};
    const client = slot.original;
    slot.original = undefined;
    await client?.$disconnect();
  });

  const client = new Proxy({} as Client, {
    get(_, prop) {
      if (slot.current) return Reflect.get(slot.current, prop);
      // e.g. `afterAll(() => db.$disconnect())` on a mocked shared client.
      if (prop === "$connect" || prop === "$disconnect") return async () => {};
      if (typeof prop === "symbol" || PROBED_PROPS.has(prop)) return undefined;
      if (prop in Object.prototype) return Reflect.get(Object.prototype, prop);
      throw new VPrismaError(
        "E_OUTSIDE_TEST",
        `vPrisma.client.${prop} was accessed outside a test. vPrisma.client is only usable inside ` +
          "`test`, `beforeEach`, `afterEach` and code called from them. Use vPrisma.originalClient " +
          "in `beforeAll`/`afterAll` (writes are not rolled back), and avoid destructuring " +
          "vPrisma.client at module top level.",
      );
    },
  });

  return {
    client,
    get originalClient() {
      return getOriginal();
    },
    configure(options) {
      if (slot.running) {
        throw new VPrismaError(
          "E_CONFIGURE_IN_TEST",
          "vPrisma.configure() was called while a test was running. It applies to the whole test " +
            "file, so call it once at the top level of the file.",
        );
      }
      slot.fileOptions = { ...slot.fileOptions, ...options };
    },
  };
}

/**
 * Pick the slot for the next createVPrisma() call. Calls are numbered from 0 within each test
 * file; the numbering restarts when the file changes, even if the previous file never reached its
 * afterAll (collection error, skipped file).
 */
function takeSlot(): Slot {
  const file = expect.getState().testPath;
  if (file !== workerState.file) {
    workerState.file = file;
    workerState.next = 0;
    // Clean up after a file whose afterAll did not run.
    for (const slot of workerState.slots) {
      slot.fileOptions = {};
      void slot.original?.$disconnect().catch(() => {});
      slot.original = undefined;
    }
  }
  const index = workerState.next++;
  const slot = workerState.slots[index] ?? {
    current: undefined,
    running: false,
    original: undefined,
    fileOptions: {},
  };
  workerState.slots[index] = slot;
  return slot;
}
