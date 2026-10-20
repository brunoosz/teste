import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  logLevel: "warning",
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(root, "electron/main.ts")],
    outfile: path.join(root, "dist-electron/main.js"),
    external: ["electron", "sharp", "ffmpeg-static", "@imgly/background-removal-node"],
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "electron/preload.ts")],
    outfile: path.join(root, "dist-electron/preload.js"),
    external: ["electron"],
  }),
]);

console.log("Electron main/preload compilados em dist-electron/");
