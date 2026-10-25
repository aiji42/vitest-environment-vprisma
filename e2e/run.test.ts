/**
 * Runs the fixture project (fixtures/) with Vitest's Node API under several pool configurations
 * against a real database, and checks every test ended the way its name says it should:
 * tests named "[fail] ..." must fail, all others must pass.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { startVitest } from "vitest/node";
import { database } from "./db.ts";

const root = fileURLToPath(new URL("./fixtures", import.meta.url));

type Outcome = { name: string; state: string; errors: string[] };

async function runFixtures(files: string[], config: Record<string, unknown>): Promise<Outcome[]> {
  // The `mode` argument form works on both Vitest 4.1 and 5 (deprecated, but not removed, in 5).
  const vitest = await startVitest("test", files, {
    root,
    watch: false,
    reporters: [{}],
    // SQLite allows a single writer, so test files cannot hold transactions in parallel.
    fileParallelism: database.provider !== "sqlite",
    ...config,
  });
  try {
    return vitest.state.getTestModules().flatMap((module) =>
      [...module.children.allTests()].map((testCase) => ({
        name: `${module.moduleId.slice(root.length + 1)} > ${testCase.fullName}`,
        state: testCase.result().state,
        errors: (testCase.result().errors ?? []).map((e) => e.message),
      })),
    );
  } finally {
    await vitest.close();
  }
}

const pools = [{ pool: "forks" }, { pool: "threads" }, { pool: "forks", isolate: false }] as const;

describe.each(pools)(`${database.provider}: %o`, (config) => {
  test("each test ends as expected", async () => {
    const outcomes = await runFixtures(["rollback", "singleton", "nested", "query-error"], config);
    expect(outcomes.length).toBeGreaterThan(0);
    const unexpected = outcomes.filter(
      (o) => o.state !== (o.name.includes("[fail]") ? "failed" : "passed"),
    );
    expect(unexpected).toEqual([]);
  });

  test("rollback: false commits across tests", async () => {
    const outcomes = await runFixtures(["commit"], config);
    expect(outcomes.map((o) => o.state)).toEqual(["passed", "passed"]);
  });

  test("concurrent tests in one file fail with E_CONCURRENT_TEST", async () => {
    const outcomes = await runFixtures(["concurrent"], config);
    const errors = outcomes.flatMap((o) => o.errors);
    expect(errors.some((message) => message.includes("E_CONCURRENT_TEST"))).toBe(true);
  });
});
