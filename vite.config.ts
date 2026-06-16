import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    // Split large third-party libs out of the main bundle. Combined with the
    // route-level React.lazy splitting in App.tsx, this keeps the initial
    // payload small (charts/vendor load only when their route is visited).
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) return "vendor-react";
          if (id.includes("@radix-ui")) return "vendor-radix";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
