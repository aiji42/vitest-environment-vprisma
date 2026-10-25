import { expect, test } from "vitest";
import { countUsers, createPair, createUser } from "../app/users.ts";

test("application code using a mocked singleton client is isolated", async () => {
  await createUser("a@example.com");
  expect(await countUsers()).toBe(1);
});

test("previous test's writes were rolled back", async () => {
  expect(await countUsers()).toBe(0);
});

test("transactions in application code work", async () => {
  await createPair("a@example.com", "b@example.com");
  expect(await countUsers()).toBe(2);
});

test("a failing transaction in application code rolls back only its own writes", async () => {
  await createUser("existing@example.com");
  await expect(createPair("new@example.com", "existing@example.com")).rejects.toThrow();
  expect(await countUsers()).toBe(1);
});
