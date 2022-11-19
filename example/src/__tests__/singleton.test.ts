import { createUser, createUsers, countUser } from "../index";

describe("singleton", () => {
  test("createUser", async () => {
    await createUser("user1", "user1@example.com");
    expect(await countUser()).toBe(1);
  });

  test("createUsers", async () => {
    await createUsers([
      {
        nickname: "user1",
        email: "user1@example.com",
      },
      {
        nickname: "user2",
        email: "user2@example.com",
      },
    ]);
    expect(await countUser()).toBe(2);
  });

  test("countUser", async () => {
    expect(await countUser()).toBe(0);
  });
});
