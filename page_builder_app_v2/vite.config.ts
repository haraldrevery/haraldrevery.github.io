import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 5174 is devUrl in src-tauri/tauri.conf.json (chosen when v1 used 5173).
    port: 5174,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
