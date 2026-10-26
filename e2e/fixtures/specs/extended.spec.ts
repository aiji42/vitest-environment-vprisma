// Issue #9: a client customized with $extends keeps its model, query and result extensions
// inside the per-test transaction when the factory returns the extended client.
import { expect, test } from "vitest";
import { createVPrisma } from "vitest-prisma";
import { createClient } from "../client.ts";

const createExtendedClient = () =>
  createClient().$extends({
    model: {
      user: {
        // `this` is the model delegate, which vitest-prisma binds to the test transaction.
        signUp(this: { create: ReturnType<typeof createClient>["user"]["create"] }, email: string) {
          return this.create({ data: { email, name: "member" } });
        },
      },
    },
    query: {
      user: {
        create({ args, query }) {
          return query({ ...args, data: { ...args.data, name: args.data.name.toUpperCase() } });
        },
      },
    },
    result: {
      user: {
        label: {
          needs: { email: true, name: true },
          compute: (user) => `${user.name} <${user.email}>`,
        },
      },
    },
  });

const vPrisma = createVPrisma(createExtendedClient);
const prisma = vPrisma.client;

test("model, query and result extensions work inside the test transaction", async () => {
  const user = await prisma.user.signUp("a@extended.test");
  expect(user.label).toBe("MEMBER <a@extended.test>");
  expect(await prisma.user.count()).toBe(1);
});

test("writes made through extension methods are rolled back", async () => {
  expect(await prisma.user.count()).toBe(0);
});

test("extensions are available inside nested transactions", async () => {
  await prisma.$transaction(async (tx) => {
    await tx.user.signUp("b@extended.test");
  });
  expect((await prisma.user.findFirstOrThrow()).label).toBe("MEMBER <b@extended.test>");
});
