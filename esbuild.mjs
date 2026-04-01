import * as esbuild from "esbuild";
import { rmSync } from "fs";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Clean dist directory before building
if (!watch) {
  rmSync("dist", { recursive: true, force: true });
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "es2022",
  sourcemap: !production,
  minify: production,
  treeShaking: true,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log("Build complete");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
