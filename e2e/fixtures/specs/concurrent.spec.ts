import { describe, expect, test } from "vitest";
import { vPrisma } from "../setup.ts";

describe.concurrent("concurrent tests", () => {
  test("one", async () => {
    expect(await vPrisma.client.user.count()).toBe(0);
  });
  test("two", async () => {
    expect(await vPrisma.client.user.count()).toBe(0);
  });
});
