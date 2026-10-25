import { expect, test } from "vitest";
import { countUsers, createPair, createUser } from "../app/users.ts";

test("application code using a mocked singleton client is isolated", async () => {
  await createUser("a@singleton.test");
  expect(await countUsers()).toBe(1);
});

test("previous test's writes were rolled back", async () => {
  expect(await countUsers()).toBe(0);
});

test("transactions in application code work", async () => {
  await createPair("a@singleton.test", "b@singleton.test");
  expect(await countUsers()).toBe(2);
});

test("a failing transaction in application code rolls back only its own writes", async () => {
  await createUser("existing@singleton.test");
  await expect(createPair("new@singleton.test", "existing@singleton.test")).rejects.toThrow();
  expect(await countUsers()).toBe(1);
});
