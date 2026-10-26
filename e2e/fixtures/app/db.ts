import { createClient } from "../client.ts";

/** The application's singleton client. Replaced by vPrisma.client in tests (see setup.ts). */
export const db = createClient();
