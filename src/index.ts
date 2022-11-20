import type { Environment } from "vitest";
import {
  JestPrisma,
  PrismaEnvironmentDelegate,
} from "@quramy/jest-prisma-core";

declare global {
  var vPrisma: JestPrisma;
}

export default {
  name: "vprisma",
  async setup(global, options) {
    const delegate = new PrismaEnvironmentDelegate(
      {
        // @ts-ignore
        projectConfig: {
          testEnvironmentOptions: options.vprisma ?? {},
        },
        // @ts-ignore
        globalConfig: {
          rootDir: "",
        },
      },
      {
        testPath: "",
      }
    );
    global.vPrismaDelegate = delegate;
    global.vPrisma = await delegate.preSetup();

    return {
      async teardown() {
        await delegate.teardown();
      },
    };
  },
} as Environment;
