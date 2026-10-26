import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createVPrisma, VPrismaError } from "../../src/index.ts";
import { createFakeClient } from "./fake-client.ts";

const fake = createFakeClient();
// Per-query savepoints are covered in savepoints.test.ts.
const boundaries = () => fake.events.filter((e) => !e.includes("SAVEPOINT"));
let factoryCalls = 0;
const factory = () => {
  factoryCalls++;
  return fake;
};

// Registered before createVPrisma so that it runs after vPrisma's own afterAll (hooks run as a stack).
afterAll(() => {
  expect(fake.disconnectCount).toBe(1);
});

const vPrisma = createVPrisma(factory, { transactionOptions: { maxWait: 1234 } });

const outside = {
  disconnect: await vPrisma.client.$disconnect(),
  toStringType: typeof vPrisma.client.toString,
  constructorName: vPrisma.client.constructor.name,
};

beforeAll(() => {
  expect(() => vPrisma.client.user).toThrowError(
    expect.objectContaining({ code: "E_OUTSIDE_TEST" }),
  );
});

beforeEach(async () => {
  // top-level beforeEach runs inside the transaction
  await vPrisma.client.user.create({ data: { name: "from-beforeEach" } });
});

afterEach(async () => {
  await vPrisma.client.user.create({ data: { name: "from-afterEach" } });
});

describe("transaction lifecycle", () => {
  test("wraps hooks and the test in one transaction", async () => {
    await vPrisma.client.user.create({ data: { name: "from-test" } });
    expect(boundaries()).toEqual(["BEGIN", "INSERT from-beforeEach", "INSERT from-test"]);
  });

  test("rolled back the previous test, including afterEach", () => {
    expect(boundaries().slice(0, 5)).toEqual([
      "BEGIN",
      "INSERT from-beforeEach",
      "INSERT from-test",
      "INSERT from-afterEach",
      "ROLLBACK",
    ]);
  });

  test("creates the client lazily, once per file", () => {
    expect(factoryCalls).toBe(1);
  });

  test("passes transaction options with test-friendly defaults", () => {
    expect(fake.transactionOptions.at(-1)).toEqual({ maxWait: 1234, timeout: 86_400_000 });
  });

  test("originalClient is the raw client", () => {
    expect(vPrisma.originalClient).toBe(fake);
  });

  test("connection management is a no-op on the test client", async () => {
    await expect(vPrisma.client.$disconnect()).resolves.toBeUndefined();
    expect(fake.disconnectCount).toBe(0);
  });

  test("client extensions must be applied in the factory", () => {
    expect(() => vPrisma.client.$extends).toThrowError(VPrismaError);
    expect(() => vPrisma.client.$extends).toThrowError(/E_UNSUPPORTED_ON_TEST_CLIENT/);
  });
});

describe("outside a test", () => {
  test("$connect/$disconnect and Object.prototype members do not throw", async () => {
    const { client } = vPrisma;
    // Evaluated during collection, i.e. outside any test transaction.
    expect(outside.disconnect).toBeUndefined();
    expect(outside.toStringType).toBe("function");
    expect(outside.constructorName).toBe("Object");
    expect(client).toBeDefined();
  });

  test("tooling probes do not throw", async () => {
    // Simulates the client being returned from a vi.mock factory or awaited.
    const { client } = vPrisma;
    expect(await Promise.resolve({ client })).toEqual({ client });
  });
});

describe("review regressions", () => {
  test("configure() inside a test throws instead of silently affecting later tests", () => {
    expect(() => vPrisma.configure({ rollback: false })).toThrowError(/E_CONFIGURE_IN_TEST/);
  });

  test("$transaction with an invalid argument throws a VPrismaError", () => {
    expect(() => vPrisma.client.$transaction("nope" as never)).toThrowError(
      /E_INVALID_TRANSACTION_ARGUMENT/,
    );
  });

  test("eager promises (e.g. $extends methods) are returned untouched", async () => {
    const before = fake.events.length;
    await expect(vPrisma.client.user.eager()).resolves.toBe("eager");
    expect(fake.events.slice(before)).toEqual(["EAGER"]);
  });
});
