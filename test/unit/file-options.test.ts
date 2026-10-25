import { afterAll, expect, test } from "vitest";
import { createVPrisma } from "../../src/index.ts";
import { createFakeClient } from "./fake-client.ts";

const fake = createFakeClient();
const vPrisma = createVPrisma(() => fake);
vPrisma.configure({ rollback: false, savepoints: false });

afterAll(() => {
  expect(fake.events.filter((e) => e === "COMMIT")).toHaveLength(2);
  expect(fake.events).not.toContain("ROLLBACK");
});

test("savepoints: false runs everything directly in the test transaction", async () => {
  await vPrisma.client.user.create({ data: { name: "a" } });
  await vPrisma.client.$transaction(async (tx) => {
    await tx.user.create({ data: { name: "b" } });
  });
  expect(fake.events).toEqual(["BEGIN", "INSERT a", "INSERT b"]);
});

test("rollback: false commits", () => {
  expect(fake.events).toContain("COMMIT");
});
