declare global {
  var vPrismaDelegate: {
    handleTestEvent: (param: { name: string; test?: any }) => Promise<void>;
  };
  var beforeEach: (fn: () => Promise<void>) => void;
  var afterEach: (fn: () => Promise<void>) => void;
}

global.beforeEach(async () => {
  await Promise.all([
    global.vPrismaDelegate.handleTestEvent({ name: "test_start" }),
    global.vPrismaDelegate.handleTestEvent({ name: "test_fn_start" }),
  ]);
});

global.afterEach(async () => {
  await Promise.all([
    global.vPrismaDelegate.handleTestEvent({ name: "test_done" }),
    global.vPrismaDelegate.handleTestEvent({
      name: "test_fn_success",
      test: { parent: null },
    }),
  ]);
});

export {};
