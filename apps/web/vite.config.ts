import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "BayCheArsBar",
        short_name: "BayCheArsBar",
        start_url: "/",
        // Chromeless install + landscape hint for the phone gaming layout —
        // browsers that don't support these fall back gracefully.
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#15100a",
        theme_color: "#15100a",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
