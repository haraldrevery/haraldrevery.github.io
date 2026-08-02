import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 5174, not 5173: v1 runs on 5173 and both must be able to run at once.
    port: 5174,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
