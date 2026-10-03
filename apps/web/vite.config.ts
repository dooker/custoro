import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import svgr from "vite-plugin-svgr";
import { readFileSync } from "fs";

export default defineConfig({
  // Shown in the navigation; one version for the whole monorepo
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version
    ),
  },
  plugins: [
    react(),
    svgr()
  ],
    server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3999",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
        "@assets": path.resolve(__dirname, "src/assets"),
        "@images": path.resolve(__dirname, "src/assets/images"),
        "@css": path.resolve(__dirname, "src/assets/stylesheets"),
        "@components": path.resolve(__dirname, "src/components"),
        "src": path.resolve(__dirname, "src"),
    },
  },
});
