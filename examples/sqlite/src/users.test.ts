import { expect, test } from "vitest";
import { vPrisma } from "../vitest.setup.ts";
import { countUsers, signUp } from "./users.ts";

test("signUp creates a user", async () => {
  await signUp("alice@example.com", "Alice");
  expect(await countUsers()).toBe(1);
});

test("each test starts from a clean database", async () => {
  expect(await countUsers()).toBe(0);
});

test("duplicate emails are rejected, and the test can keep querying", async () => {
  await signUp("bob@example.com", "Bob");
  await expect(signUp("bob@example.com", "Bob")).rejects.toThrow();
  expect(await countUsers()).toBe(1);
});

test("vPrisma.client can be used directly", async () => {
  await vPrisma.client.user.create({ data: { email: "carol@example.com", name: "Carol" } });
  expect(await vPrisma.client.user.findMany({ select: { name: true } })).toEqual([
    { name: "Carol" },
  ]);
});
