const prisma = vPrisma.client;

describe("User", () => {
  test("Add user", async () => {
    const createdUser = await prisma.user.create({
      data: {
        nickname: "user1",
        email: "user1@example.com",
      },
    });

    expect(
      await prisma.user.findFirst({
        where: {
          nickname: "user1",
        },
      })
    ).toStrictEqual(createdUser);
    expect(await prisma.user.count()).toBe(1);
  });

  test("Add users on transaction", async () => {
    const [user1, user2] = await prisma.$transaction(async (t) => {
      const user1 = await t.user.create({
        data: {
          nickname: "user1",
          email: "user1@example.com",
        },
      });
      const user2 = await t.user.create({
        data: {
          nickname: "user2",
          email: "user2@example.com",
        },
      });
      return [user1, user2];
    });

    expect(
      await prisma.user.findFirst({
        where: {
          nickname: "user1",
        },
      })
    ).toStrictEqual(user1);

    expect(
      await prisma.user.findFirst({
        where: {
          nickname: "user2",
        },
      })
    ).toStrictEqual(user2);
    expect(await prisma.user.count()).toBe(2);
  });

  test("Count user", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  describe("add User in beforeEach", () => {
    beforeEach(async () => {
      await prisma.user.create({
        data: {
          nickname: "userX",
          email: "userX@example.com",
        },
      });
    });

    test("Count user", async () => {
      expect(await prisma.user.count()).toBe(1);
    });
  });
});
