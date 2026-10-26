import { expect, test } from "vitest";
import { VPrismaError } from "../../src/index.ts";

test("errors carry a stable code and a docs link", () => {
  const error = new VPrismaError("E_OUTSIDE_TEST", "message");
  expect(error.code).toBe("E_OUTSIDE_TEST");
  expect(error.docs).toMatch(/docs\/errors\.md#e_outside_test$/);
  expect(error.message).toMatch(/^\[vitest-prisma:E_OUTSIDE_TEST\] message\nSee: /);
});
