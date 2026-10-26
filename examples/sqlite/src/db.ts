import { createClient } from "./client.ts";

/** The application's shared client. Tests replace it with vPrisma.client (see vitest.setup.ts). */
export const db = createClient();
