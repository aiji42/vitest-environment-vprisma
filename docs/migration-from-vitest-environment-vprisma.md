# Migrating from vitest-environment-vprisma

`vitest-prisma` is the successor of `vitest-environment-vprisma` v1. It is a rewrite: it no longer
ships a Vitest environment and no longer depends on `@quramy/jest-prisma-core`. The per-test
transaction is driven by Vitest's `aroundEach` hook.

## Requirements

| | vitest-environment-vprisma v1 | vitest-prisma |
|---|---|---|
| Vitest | 0.34 – 1.x | **>= 4.1** |
| Prisma | 2.29 – 5.x | **>= 6** (any generator, any driver adapter) |
| Node.js | any | **>= 22.12** |
| Module format | ESM + CJS | ESM only |

## Steps

1. Swap the package:

   ```bash
   npm remove vitest-environment-vprisma
   npm install -D vitest-prisma
   ```

2. Create a setup file that builds the client yourself. This replaces `environment: "vprisma"`,
   the `vitest-environment-vprisma/setup` setup file and the `databaseUrl` option:

   ```ts
   // vitest.setup.ts
   import { createVPrisma } from "vitest-prisma";
   import { createClient } from "./src/client";

   export const vPrisma = createVPrisma(createClient);
   ```

3. Update `vitest.config.ts`:

   ```diff
    export default defineConfig({
      test: {
   -    globals: true,
   -    environment: "vprisma",
   -    setupFiles: ["vitest-environment-vprisma/setup", "./vitest.setup.ts"],
   -    environmentOptions: { vprisma: { baseEnv: "jsdom", disableRollback: false } },
   +    environment: "jsdom", // only if you used baseEnv; otherwise omit
   +    setupFiles: ["./vitest.setup.ts"],
      },
    });
   ```

   `globals: true` is no longer required.

4. Replace the global `vPrisma` with an import, and remove `"vitest-environment-vprisma"` from
   `compilerOptions.types` in `tsconfig.json`:

   ```diff
   +import { vPrisma } from "../vitest.setup";
    const prisma = vPrisma.client;
   ```

5. Map the old options:

   | v1 option | vitest-prisma |
   |---|---|
   | `baseEnv` | Use Vitest's own `environment` option (or `// @vitest-environment jsdom`). |
   | `disableRollback: true` | `createVPrisma(factory, { rollback: false })`, or `vPrisma.configure({ rollback: false })` in one file |
   | `databaseUrl` | Pass the URL to your adapter / client in the factory. |
   | `verboseQuery: true` | Enable Prisma's own logging in the factory: `new PrismaClient({ adapter, log: ["query"] })` |
   | `// @vitest-environment-options {...}` | `vPrisma.configure({...})` at the top of the test file |
   | `enableExperimentalRollbackInTransaction` | Always on (`savepoints: true` by default). |

## Behavior changes

- **Top-level `beforeEach` / `afterEach` now run inside the test transaction.** The v1 workaround
  of moving `beforeEach` into a `describe` block is no longer needed.
- **A failing query no longer breaks the rest of the test on PostgreSQL.** Each standalone query
  runs in its own savepoint.
- **Nested `$transaction` calls roll back on their own when they fail.** v1 needed an experimental
  flag for this.
- **Standalone queries are slower.** Each one runs in a savepoint, which takes about 1.8× as long
  on a local PostgreSQL. Use `savepoints: false` (globally or per file) for v1-like speed. See
  [Speed vs. savepoints](../README.md#speed-vs-savepoints).
- **Concurrent tests in one file now fail fast** with `E_CONCURRENT_TEST`. In v1 they silently
  shared a transaction.
- **The client is disconnected after each test file.**
