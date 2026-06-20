import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const assetVersion = "v014";

export default defineConfig({
  base: "/KuroStep/",
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
