import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/KuroStep/",
  plugins: [react()],
  build: {
    outDir: "dist-react",
  },
});
