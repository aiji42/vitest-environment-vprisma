import { vi } from "vitest";
import { createVPrisma } from "vitest-prisma";
import { createClient } from "./client.ts";

export const vPrisma = createVPrisma(createClient);

vi.mock("./app/db.ts", () => ({ db: vPrisma.client }));
