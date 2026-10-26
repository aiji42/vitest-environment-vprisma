import { db } from "./db.ts";

export const createUser = (email: string, name = "user") =>
  db.user.create({ data: { email, name } });

export const countUsers = () => db.user.count();

/** Creates both users atomically, like typical application code would. */
export const createPair = (a: string, b: string) =>
  db.$transaction(async (tx) => {
    await tx.user.create({ data: { email: a, name: "a" } });
    await tx.user.create({ data: { email: b, name: "b" } });
  });
