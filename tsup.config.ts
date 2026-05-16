import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  shims: true,
  target: "node18",
  platform: "node",
  splitting: false,
  sourcemap: false,
  minify: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
