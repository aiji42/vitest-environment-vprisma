beforeEach(async () => {
  // ⛔ vPrisma.client is not available for top-level beforeEach.
  // if you want to use beforeEach to prepare data, please execute it in `describe`.
});

const prisma = vPrisma.client;

describe("prisma", () => {
  describe("add User in beforeEach", () => {
    beforeEach(async () => {
      // Since it is in `describe`, you can use vPrisma.client to issue secure queries with transaction isolation.
      await prisma.user.create({
        data: {
          nickname: "userX",
          email: "userX@example.com",
        },
      });
    });

    test("Count user first time", async () => {
      expect(await prisma.user.count()).toBe(1);
    });

    test("Count user second time", async () => {
      expect(await prisma.user.count()).toBe(1);
    });
  });

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
          id: createdUser.id,
        },
      })
    ).toStrictEqual(createdUser);
    expect(await prisma.user.count()).toBe(1);
  });

  test("Add users in transaction", async () => {
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
          id: user1.id,
        },
      })
    ).toStrictEqual(user1);

    expect(
      await prisma.user.findFirst({
        where: {
          id: user2.id,
        },
      })
    ).toStrictEqual(user2);
    expect(await prisma.user.count()).toBe(2);
  });

  test("Count user", async () => {
    expect(await prisma.user.count()).toBe(0);
  });
});
