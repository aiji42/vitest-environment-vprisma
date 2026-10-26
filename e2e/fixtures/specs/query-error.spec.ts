import { expect, test } from "vitest";
import { vPrisma } from "../setup.ts";

const prisma = vPrisma.client;

// On PostgreSQL a failed statement aborts the surrounding transaction ("current transaction is
// aborted"). Per-query savepoints must keep the test usable, like an autocommit connection would.
test("queries keep working after a failed standalone query", async () => {
  await prisma.user.create({ data: { email: "dup@query-error.test", name: "d" } });
  await expect(
    prisma.user.create({ data: { email: "dup@query-error.test", name: "d" } }),
  ).rejects.toThrow();
  expect(await prisma.user.count()).toBe(1);
});

test("raw queries are covered too", async () => {
  await expect(prisma.$executeRawUnsafe("SELECT * FROM no_such_table")).rejects.toThrow();
  expect(await prisma.user.count()).toBe(0);
});

test("parallel standalone queries", async () => {
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.create({ data: { email: `p${i}@query-error.test`, name: "p" } }),
    ),
  );
  expect(await prisma.user.count()).toBe(5);
});
