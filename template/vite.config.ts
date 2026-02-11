import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync, copyFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const isWatch = process.argv.includes("--watch");

/**
 * In watch mode (npm run dev), build directly to the installed plugin directory
 * so hot-reload picks up changes automatically. In production build mode,
 * output to dist/ as normal.
 */
function getOutDir(): string {
  if (!isWatch) return "dist";
  try {
    const manifest = JSON.parse(readFileSync("manifest.json", "utf-8"));
    const treelineDir = process.env.TREELINE_DIR || join(homedir(), ".treeline");
    return join(treelineDir, "plugins", manifest.id);
  } catch {
    return "dist";
  }
}

/**
 * Vite plugin that copies manifest.json to the output directory in watch mode.
 * The installed plugin directory needs both index.js and manifest.json.
 */
function copyManifestPlugin() {
  if (!isWatch) return null;
  return {
    name: "copy-manifest",
    writeBundle(options: any) {
      try {
        const outDir = options.dir || "dist";
        copyFileSync("manifest.json", join(outDir, "manifest.json"));
      } catch {
        // Silently ignore - manifest copy is best-effort
      }
    },
  };
}

const outDir = getOutDir();

export default defineConfig({
  plugins: [
    svelte({
      emitCss: false, // Inline CSS into JS - required for plugins
    }),
    copyManifestPlugin(),
  ].filter(Boolean),
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    // Bundle everything including Svelte - each plugin has its own runtime
    outDir,
    emptyOutDir: !isWatch, // Don't wipe the installed plugin dir in watch mode
    cssCodeSplit: false,
  },
});
