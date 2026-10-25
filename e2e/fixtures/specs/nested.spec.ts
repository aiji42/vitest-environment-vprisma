import { expect, test } from "vitest";
import { createPair, createUser } from "../app/users.ts";
import { vPrisma } from "../setup.ts";

const prisma = vPrisma.client;

test("array-form $transaction", async () => {
  const [a, b] = await prisma.$transaction([
    prisma.user.create({ data: { email: "a@nested.test", name: "a" } }),
    prisma.user.create({ data: { email: "b@nested.test", name: "b" } }),
  ]);
  expect([a.email, b.email]).toEqual(["a@nested.test", "b@nested.test"]);
  expect(await prisma.user.count()).toBe(2);
});

test("a failed nested transaction keeps the outer writes", async () => {
  await prisma.user.create({ data: { email: "outer@nested.test", name: "o" } });
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { email: "inner@nested.test", name: "i" } });
      throw new Error("abort inner");
    }),
  ).rejects.toThrow("abort inner");
  expect(await prisma.user.findMany({ select: { email: true } })).toEqual([
    { email: "outer@nested.test" },
  ]);
});

test("a database error inside a nested transaction does not break the test transaction", async () => {
  await prisma.user.create({ data: { email: "dup@nested.test", name: "d" } });
  await expect(
    prisma.$transaction((tx) => tx.user.create({ data: { email: "dup@nested.test", name: "d" } })),
  ).rejects.toThrow();
  expect(await prisma.user.count()).toBe(1);
});

test("fluent relation queries", async () => {
  const user = await prisma.user.create({
    data: { email: "f@nested.test", name: "f", posts: { create: [{ title: "hello" }] } },
  });
  const posts = await prisma.user.findUnique({ where: { id: user.id } }).posts();
  expect(posts?.map((p) => p.title)).toEqual(["hello"]);
});

test("a failing transaction nested inside another one rolls back only itself", async () => {
  await prisma.$transaction(async () => {
    await createUser("x@nested.test");
    await expect(createPair("y@nested.test", "x@nested.test")).rejects.toThrow();
    await createUser("z@nested.test");
  });
  expect(await prisma.user.count()).toBe(2);
});
