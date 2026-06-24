import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./extension/manifest.json";

// Build the JobPilot Autofill browser extension (Manifest V3). @crxjs handles the
// MV3 quirks (content-script IIFE bundling, manifest emission, HMR in dev).
// Output: extension-dist/ — load that folder as an unpacked extension in Chrome.
export default defineConfig({
  root: "extension",
  plugins: [crx({ manifest })],
  build: {
    outDir: "../extension-dist",
    emptyOutDir: true,
  },
});
