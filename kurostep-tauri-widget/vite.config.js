import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

const assetVersion = "v037";
const isDesktopBuild = process.env.KUROSTEP_DESKTOP_BUILD === "1";
function currentBuildCommit() {
  const commit = execSync("git rev-parse --short HEAD").toString().trim();
  try {
    execSync("git diff --quiet HEAD -- .", { stdio: "ignore" });
    return commit;
  } catch {
    return `${commit}-dirty`;
  }
}

const buildCommit = process.env.KUROSTEP_BUILD_COMMIT || currentBuildCommit();
const buildTime = process.env.KUROSTEP_BUILD_TIME || new Date().toISOString();

export default defineConfig({
  base: isDesktopBuild ? "./" : "/KuroStep/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_KUROSTEP_BUILD_COMMIT": JSON.stringify(buildCommit),
    "import.meta.env.VITE_KUROSTEP_BUILD_TIME": JSON.stringify(buildTime),
  },
  build: {
    outDir: "dist-react",
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${assetVersion}.js`,
        chunkFileNames: `assets/[name]-[hash]-${assetVersion}.js`,
        assetFileNames: `assets/[name]-[hash]-${assetVersion}[extname]`,
      },
    },
  },
});
