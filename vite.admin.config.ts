import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Dev-only: the admin server shares the project root with the main app's
// index.html, so Vite would serve the job-seeker app at "/". Rewrite page
// requests (root + client routes, not assets/vite/api) to admin.html so the
// admin app is what loads at http://localhost:5174/ and on deep-link refresh.
function serveAdminEntry() {
  return {
    name: "serve-admin-entry",
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || "/";
        if (
          !url.startsWith("/@") && !url.startsWith("/src/") && !url.startsWith("/node_modules/") &&
          !url.startsWith("/api") && !/\.[a-z0-9]+(\?|$)/i.test(url)
        ) {
          req.url = "/admin.html";
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Prod build is served by Express under /admin (so assets resolve to /admin/...).
  // Dev server serves the admin entry at "/" via the plugin below.
  base: command === "build" ? "/admin/" : "/",
  plugins: [serveAdminEntry(), react(), tailwindcss()],
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
    open: "/",
    allowedHosts: "all",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
