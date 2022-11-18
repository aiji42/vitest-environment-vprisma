import type { JestPrisma } from "@quramy/jest-prisma-core";

declare global {
  var vPrisma: JestPrisma;
}
