import type { Environment } from "vitest";
import {
  JestPrisma,
  PrismaEnvironmentDelegate,
  JestPrismaEnvironmentOptions,
} from "@quramy/jest-prisma-core";
import { builtinEnvironments } from "vitest/dist/environments.js";

declare global {
  var vPrisma: JestPrisma;
}

type Options = {
  vprisma?: JestPrismaEnvironmentOptions & {
    baseEnv?: keyof typeof builtinEnvironments;
  };
};

const environment: Environment = {
  name: "vprisma",
  async setup(global, options: Options) {
    const { baseEnv, ...vprisma } = options.vprisma ?? {};
    const env = builtinEnvironments[baseEnv ?? "node"];
    const envReturn = await env.setup(global, {});

    const delegate = new PrismaEnvironmentDelegate(
      {
        projectConfig: {
          testEnvironmentOptions: vprisma ?? {},
        },
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
      async teardown(global) {
        await delegate.teardown();
        delete global.vPrismaDelegate;
        delete global.vPrisma;
        await envReturn.teardown(global);
      },
    };
  },
};

export default environment;
