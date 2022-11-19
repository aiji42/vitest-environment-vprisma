import { createTeam, countTeam } from "../index";
import { test } from "vitest";

// @vitest-environment-options { "disableRollback": true }
describe("disableRollback", () => {
  test("createTeam", async () => {
    await createTeam("team1");
    expect(await countTeam()).toBe(1);
  });

  test("countTeam", async () => {
    expect(await countTeam()).toBe(1);
  });

  test("createTeam (duplicate error)", async () => {
    await expect(createTeam("team1")).rejects.toThrowError();
  });
});
