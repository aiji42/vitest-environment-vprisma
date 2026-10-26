import { createVPrisma } from "vitest-prisma";
import { initialize } from "./src/__generated__/fabbrica/index.js";
import { createClient } from "./src/client.ts";

export const vPrisma = createVPrisma(createClient);

// vPrisma.client always points at the running test's transaction, so factories write into it
// and everything they create is rolled back.
initialize({ prisma: vPrisma.client });
