import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { vPrisma } from "../setup.ts";

const prisma = vPrisma.client;

beforeEach(async () => {
  await prisma.user.create({ data: { email: "before-each@example.com", name: "x" } });
});

afterEach(async () => {
  await prisma.user.create({ data: { email: "after-each@example.com", name: "x" } });
});

describe("rollback", () => {
  test("writes are visible within the test", async () => {
    await prisma.user.create({ data: { email: "a@example.com", name: "a" } });
    expect(await prisma.user.count()).toBe(2);
  });

  test("writes from the previous test, beforeEach and afterEach are gone", async () => {
    expect(await prisma.user.count()).toBe(1);
  });

  test("[fail] a failing test", async () => {
    await prisma.user.create({ data: { email: "failing@example.com", name: "f" } });
    throw new Error("intentional failure");
  });

  test("is rolled back too", async () => {
    expect(await prisma.user.findUnique({ where: { email: "failing@example.com" } })).toBeNull();
  });
});
