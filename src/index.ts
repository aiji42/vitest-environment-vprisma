import { afterAll, aroundEach } from "vitest";
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
const DEFAULT_MAX_WAIT = 10_000;

// Properties that tooling (vi.mock, util.inspect, expect, await) probes on arbitrary objects.
// They must not throw when accessed outside a test.
const PROBED_PROPS = new Set<PropertyKey>([
  "then",
  "__esModule",
  "toJSON",
  "asymmetricMatch",
  "$$typeof",
  "nodeType",
]);

class RollbackSignal extends Error {}

/**
 * Per-worker state shared by every createVPrisma() call. With `isolate: false`, the setup file is
 * re-run for each test file while application modules (and the vPrisma.client they captured in
 * vi.mock) stay cached. Instances are matched to slots by call order within a file, so a stale
 * reference still reaches the current file's transaction.
 */
interface Slot {
  current: unknown;
  running: boolean;
}
interface WorkerState {
  slots: Slot[];
  next: number;
}
const STATE_KEY = Symbol.for("vitest-prisma.state");
const globals = globalThis as Record<symbol, WorkerState | undefined>;
const workerState: WorkerState = globals[STATE_KEY] ?? { slots: [], next: 0 };
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
  let fileOptions: FileOptions = {};
  let original: Client | undefined;
  const slot: Slot = workerState.slots[workerState.next] ?? { current: undefined, running: false };
  workerState.slots[workerState.next] = slot;
  workerState.next++;

  const getOriginal = (): Client => {
    if (original) return original;
    const client = factory();
    if (typeof client?.$transaction !== "function") {
      throw new VPrismaError(
        "E_INVALID_CLIENT",
        "The factory passed to createVPrisma() must return a PrismaClient instance.",
      );
    }
    original = client;
    return client;
  };

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
      ...fileOptions,
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
  });

  afterAll(async () => {
    workerState.next = 0;
    fileOptions = {};
    const client = original;
    original = undefined;
    await client?.$disconnect();
  });

  const client = new Proxy({} as Client, {
    get(_, prop) {
      if (slot.current) return Reflect.get(slot.current, prop);
      if (typeof prop === "symbol" || PROBED_PROPS.has(prop)) return undefined;
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
      fileOptions = { ...fileOptions, ...options };
    },
  };
}
