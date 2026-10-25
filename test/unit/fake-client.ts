type FakeTx = {
  user: {
    create(args: { data: { name: string } }): PromiseLike<{ name: string }>;
    fail(): PromiseLike<never>;
  };
  $executeRawUnsafe(sql: string): Promise<number>;
  $transaction?: (fn: () => Promise<unknown>) => Promise<unknown>;
};

// Mirrors the two PrismaClient.$transaction overloads.
type FakeTransaction = {
  <R>(fn: (tx: FakeTx) => PromiseLike<R>, options?: unknown): Promise<R>;
  <const P extends readonly PromiseLike<unknown>[]>(
    queries: P,
  ): Promise<{ -readonly [K in keyof P]: Awaited<P[K]> }>;
};

/**
 * A stand-in for PrismaClient that records transaction boundaries and SQL instead of talking to a DB.
 * Plain counters are used instead of vi.fn() because Vitest clears mocks between tests by default.
 */
export function createFakeClient({ nativeNested = false } = {}) {
  const events: string[] = [];
  const transactionOptions: unknown[] = [];
  let disconnectCount = 0;

  // Like PrismaPromise, queries are lazy: they only run when awaited.
  const lazy = <T>(run: () => Promise<T>): PromiseLike<T> => ({
    // biome-ignore lint/suspicious/noThenProperty: mimics PrismaPromise
    then: (onFulfilled, onRejected) => run().then(onFulfilled, onRejected),
  });
  const createTx = (): FakeTx => ({
    user: {
      create: ({ data }: { data: { name: string } }) =>
        lazy(async () => {
          events.push(`INSERT ${data.name}`);
          return data;
        }),
      fail: () =>
        lazy(async () => {
          events.push("QUERY ERROR");
          throw new Error("query failed");
        }),
    },
    $executeRawUnsafe: async (sql: string) => {
      events.push(sql);
      return 0;
    },
    // Recent Prisma 7 transaction clients support nested transactions natively.
    ...(nativeNested && {
      $transaction: async (fn: () => Promise<unknown>) => {
        events.push("NESTED BEGIN");
        try {
          const result = await fn();
          events.push("NESTED COMMIT");
          return result;
        } catch (error) {
          events.push("NESTED ROLLBACK");
          throw error;
        }
      },
    }),
  });

  return {
    events,
    transactionOptions,
    get disconnectCount() {
      return disconnectCount;
    },
    user: createTx().user,
    $transaction: (async (fn: (tx: FakeTx) => PromiseLike<unknown>, options?: unknown) => {
      transactionOptions.push(options);
      events.push("BEGIN");
      try {
        const result = await fn(createTx());
        events.push("COMMIT");
        return result;
      } catch (error) {
        events.push("ROLLBACK");
        throw error;
      }
    }) as FakeTransaction,
    async $disconnect() {
      disconnectCount++;
    },
    $extends() {},
  };
}
