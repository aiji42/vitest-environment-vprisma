import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  tsconfig: "tsconfig.build.json",
  format: "esm",
  platform: "node",
  target: "node22",
  // Generate declarations with oxc (requires isolatedDeclarations); TypeScript 7 has no JS API.
  dts: { oxc: {} },
  clean: true,
  sourcemap: true,
});
