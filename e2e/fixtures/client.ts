import * as sqliteAdapter from "@prisma/adapter-better-sqlite3";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaPg } from "@prisma/adapter-pg";
import { database } from "../db.ts";
// The generated clients share the same schema; the PostgreSQL one provides the types.
import type { PrismaClient } from "../generated/postgresql/client.ts";

// `pnpm generate` generates all three clients, so each import below resolves.
const loaders = {
  postgresql: () => import("../generated/postgresql/client.ts"),
  mysql: () => import("../generated/mysql/client.ts"),
  sqlite: () => import("../generated/sqlite/client.ts"),
};
const { PrismaClient: Client } = (await loaders[database.provider]()) as {
  PrismaClient: typeof PrismaClient;
};

// Prisma 6 names the class PrismaBetterSQLite3.
const sqliteExports = sqliteAdapter as Record<string, unknown>;
const SqliteAdapter = (sqliteExports.PrismaBetterSqlite3 ??
  sqliteExports.PrismaBetterSQLite3) as typeof sqliteAdapter.PrismaBetterSqlite3;

export function createClient(): PrismaClient {
  switch (database.provider) {
    case "postgresql":
      return new Client({ adapter: new PrismaPg({ connectionString: database.url }) });
    case "mysql":
      return new Client({ adapter: new PrismaMariaDb(database.url) });
    case "sqlite":
      return new Client({ adapter: new SqliteAdapter({ url: database.url }) });
  }
}
