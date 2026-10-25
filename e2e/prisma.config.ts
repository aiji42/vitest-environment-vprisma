import { defineConfig } from "prisma/config";
import { database } from "./db.ts";

export default defineConfig({
  schema: `prisma/${database.provider}/schema.prisma`,
  datasource: { url: database.url },
});
