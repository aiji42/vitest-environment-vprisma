import { expect, test } from "vitest";
import { vPrisma } from "../setup.ts";

const prisma = vPrisma.client;

test("array-form $transaction", async () => {
  const [a, b] = await prisma.$transaction([
    prisma.user.create({ data: { email: "a@example.com", name: "a" } }),
    prisma.user.create({ data: { email: "b@example.com", name: "b" } }),
  ]);
  expect([a.email, b.email]).toEqual(["a@example.com", "b@example.com"]);
  expect(await prisma.user.count()).toBe(2);
});

test("a failed nested transaction keeps the outer writes", async () => {
  await prisma.user.create({ data: { email: "outer@example.com", name: "o" } });
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { email: "inner@example.com", name: "i" } });
      throw new Error("abort inner");
    }),
  ).rejects.toThrow("abort inner");
  expect(await prisma.user.findMany({ select: { email: true } })).toEqual([
    { email: "outer@example.com" },
  ]);
});

test("a database error inside a nested transaction does not break the test transaction", async () => {
  await prisma.user.create({ data: { email: "dup@example.com", name: "d" } });
  await expect(
    prisma.$transaction((tx) => tx.user.create({ data: { email: "dup@example.com", name: "d" } })),
  ).rejects.toThrow();
  expect(await prisma.user.count()).toBe(1);
});
