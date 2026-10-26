import { beforeEach, expect, test } from "vitest";
import { createVPrisma } from "../../src/index.ts";
import { createFakeClient } from "./fake-client.ts";

const fake = createFakeClient();
const vPrisma = createVPrisma(() => fake);
const prisma = vPrisma.client;

beforeEach(() => {
  fake.events.length = 0;
});

test("callback form runs inside a savepoint", async () => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { name: "a" } });
    return "done";
  });
  expect(result).toBe("done");
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "INSERT a",
    "RELEASE SAVEPOINT vprisma_sp_1",
  ]);
});

test("a failing inner transaction rolls back to its savepoint and rethrows", async () => {
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { name: "a" } });
      await tx.user.fail();
    }),
  ).rejects.toThrowError("query failed");
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "INSERT a",
    "QUERY ERROR",
    "ROLLBACK TO SAVEPOINT vprisma_sp_1",
  ]);
});

test("array form runs queries sequentially inside a savepoint", async () => {
  const result = await prisma.$transaction([
    prisma.user.create({ data: { name: "a" } }),
    prisma.user.create({ data: { name: "b" } }),
  ]);
  expect(result).toEqual([{ name: "a" }, { name: "b" }]);
  expect(fake.events.at(0)).toBe("SAVEPOINT vprisma_sp_1");
  expect(fake.events.at(-1)).toBe("RELEASE SAVEPOINT vprisma_sp_1");
});

test("transactions nested through the shared client do not deadlock", async () => {
  await prisma.$transaction(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { name: "inner" } });
    });
  });
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "SAVEPOINT vprisma_sp_2",
    "INSERT inner",
    "RELEASE SAVEPOINT vprisma_sp_2",
    "RELEASE SAVEPOINT vprisma_sp_1",
  ]);
});

test("sibling transactions started concurrently are serialized", async () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  await Promise.all([
    prisma.$transaction(async (tx) => {
      await tick();
      await tx.user.create({ data: { name: "first" } });
    }),
    prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { name: "second" } });
    }),
  ]);
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "INSERT first",
    "RELEASE SAVEPOINT vprisma_sp_1",
    "SAVEPOINT vprisma_sp_2",
    "INSERT second",
    "RELEASE SAVEPOINT vprisma_sp_2",
  ]);
});

test("a failed sibling does not block the next one", async () => {
  await expect(prisma.$transaction(() => prisma.user.fail())).rejects.toThrow();
  await expect(prisma.$transaction(async () => "ok")).resolves.toBe("ok");
});
test("a standalone query runs in its own savepoint", async () => {
  await prisma.user.create({ data: { name: "a" } });
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "INSERT a",
    "RELEASE SAVEPOINT vprisma_sp_1",
  ]);
});

test("a failing standalone query rolls back to its savepoint so the test can continue", async () => {
  await expect(prisma.user.fail()).rejects.toThrowError("query failed");
  await prisma.user.create({ data: { name: "after" } });
  expect(fake.events).toEqual([
    "SAVEPOINT vprisma_sp_1",
    "QUERY ERROR",
    "ROLLBACK TO SAVEPOINT vprisma_sp_1",
    "SAVEPOINT vprisma_sp_2",
    "INSERT after",
    "RELEASE SAVEPOINT vprisma_sp_2",
  ]);
});

test("a query runs only once even if awaited repeatedly", async () => {
  const query = prisma.user.create({ data: { name: "once" } });
  await query;
  await query;
  expect(fake.events.filter((e) => e === "INSERT once")).toHaveLength(1);
});

test("a query that is never awaited never runs", () => {
  prisma.user.create({ data: { name: "lazy" } });
  expect(fake.events).toEqual([]);
});
