import { beforeEach, expect, test } from "vitest";
import { vPrisma } from "../vitest.setup.ts";
import { definePostFactory, defineUserFactory } from "./__generated__/fabbrica/index.js";

const UserFactory = defineUserFactory();
const PostFactory = definePostFactory({ defaultData: { author: UserFactory } });

beforeEach(async () => {
  // Top-level beforeEach runs inside the test transaction too.
  await UserFactory.create({ email: "admin@example.com" });
});

test("factories write through the test transaction", async () => {
  await UserFactory.createList(2);
  await PostFactory.create();
  expect(await vPrisma.client.user.count()).toBe(4);
  expect(await vPrisma.client.post.count()).toBe(1);
});

test("everything the factories created is rolled back", async () => {
  expect(await vPrisma.client.user.count()).toBe(1);
  expect(await vPrisma.client.post.count()).toBe(0);
});
