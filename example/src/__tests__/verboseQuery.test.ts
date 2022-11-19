import { createUser, countUser } from "../index";

// @vitest-environment-options { "verboseQuery": true }
describe("verboseQuery", () => {
  test("createUser", async () => {
    await createUser("user1", "user1@example.com");
    expect(await countUser()).toBe(1);
  });

  test("countUser", async () => {
    expect(await countUser()).toBe(0);
  });
});
