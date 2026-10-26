import { db } from "./db.ts";

export function signUp(email: string, name: string) {
  return db.user.create({ data: { email, name } });
}

export function countUsers() {
  return db.user.count();
}
