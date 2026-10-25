import { beforeEach, expect, test } from "vitest";
import { createVPrisma } from "../../src/index.ts";
import { createFakeClient } from "./fake-client.ts";

const fake = createFakeClient({ nativeNested: true });
const prisma = createVPrisma(() => fake).client;

beforeEach(() => {
  fake.events.length = 0;
});

test("uses Prisma's native nested transactions instead of raw SAVEPOINT statements", async () => {
  await prisma.user.create({ data: { name: "a" } });
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { name: "b" } });
      await tx.user.fail();
    }),
  ).rejects.toThrowError("query failed");
  expect(fake.events).toEqual([
    "NESTED BEGIN",
    "INSERT a",
    "NESTED COMMIT",
    "NESTED BEGIN",
    "INSERT b",
    "QUERY ERROR",
    "NESTED ROLLBACK",
  ]);
});
