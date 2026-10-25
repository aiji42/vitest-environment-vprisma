/** Which database the e2e suite runs against. Selected with E2E_DB (default: sqlite). */
const databases = {
  sqlite: { provider: "sqlite", url: "file:./e2e.db" },
  postgresql: {
    provider: "postgresql",
    url: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/vprisma_e2e",
  },
  mysql: {
    provider: "mysql",
    url: process.env.DATABASE_URL ?? "mysql://root:password@localhost:3306/vprisma_e2e",
  },
} as const;

type Name = keyof typeof databases;
const name = (process.env.E2E_DB ?? "sqlite") as Name;
if (!(name in databases)) throw new Error(`Unknown E2E_DB: ${name}`);

export const database: (typeof databases)[Name] = databases[name];
