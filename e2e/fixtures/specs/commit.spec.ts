import { afterAll, expect, test } from "vitest";
import { vPrisma } from "../setup.ts";

vPrisma.configure({ rollback: false });

afterAll(async () => {
  await vPrisma.originalClient.user.deleteMany({ where: { email: { startsWith: "commit-" } } });
});

test("writes are committed", async () => {
  await vPrisma.client.user.create({ data: { email: "commit-1@example.com", name: "c" } });
});

test("and visible in the next test", async () => {
  expect(await vPrisma.client.user.count({ where: { email: { startsWith: "commit-" } } })).toBe(1);
});
