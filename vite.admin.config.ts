import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ command }) => ({
  // Prod build is served by Express under /admin (so assets resolve to /admin/...).
  // Dev server stays at the root of :5174, unchanged.
  base: command === "build" ? "/admin/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    outDir: "dist-admin",
    rollupOptions: {
      input: path.resolve(__dirname, "admin.html"),
    },
  },
  server: {
    port: 5174,
    open: "/admin.html",
    allowedHosts: "all",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
