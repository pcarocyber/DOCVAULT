import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { motores } from "./motores";

export default defineConfig({
  plugins: [react(), motores()],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  server: { port: 5180 },
  preview: { port: 5181 },
  build: { target: "es2022" },
  worker: { format: "es" },
});
