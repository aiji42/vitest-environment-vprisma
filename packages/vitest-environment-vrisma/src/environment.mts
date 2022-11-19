import type { Environment } from "vitest";
import { PrismaEnvironmentDelegate } from "@quramy/jest-prisma-core";

export default {
  name: "prisma",
  async setup(global, options) {
    const delegate = new PrismaEnvironmentDelegate(
      {
        // @ts-ignore
        projectConfig: {
          testEnvironmentOptions: options.prisma ?? {},
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
