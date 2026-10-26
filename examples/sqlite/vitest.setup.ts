import { vi } from "vitest";
import { createVPrisma } from "vitest-prisma";
// Import the factory, not the module you mock below: the mock factory must not run before
// `vPrisma` is initialized.
import { createClient } from "./src/client.ts";

// Every test runs in a transaction that is rolled back afterwards.
export const vPrisma = createVPrisma(createClient);

// Make application code that imports the shared client use the per-test transaction.
vi.mock("./src/db.ts", () => ({ db: vPrisma.client }));
