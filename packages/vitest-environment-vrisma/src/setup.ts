import { afterEach, beforeEach } from "vitest";

declare global {
  var vPrismaDelegate: {
    handleTestEvent: (param: { name: string; test?: any }) => Promise<void>;
  };
}

beforeEach(async () => {
  await Promise.all([
    global.vPrismaDelegate.handleTestEvent({ name: "test_start" }),
    global.vPrismaDelegate.handleTestEvent({ name: "test_fn_start" }),
  ]);
});

afterEach(async () => {
  await Promise.all([
    global.vPrismaDelegate.handleTestEvent({ name: "test_done" }),
    global.vPrismaDelegate.handleTestEvent({
      name: "test_fn_success",
      test: { parent: null },
    }),
  ]);
});