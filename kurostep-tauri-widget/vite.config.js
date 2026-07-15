import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const assetVersion = "v037";
const isDesktopBuild = process.env.KUROSTEP_DESKTOP_BUILD === "1";

export default defineConfig({
  base: isDesktopBuild ? "./" : "/KuroStep/",
  plugins: [react()],
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
