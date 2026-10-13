import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Bordereaux & Factures",
        short_name: "Bordereaux",
        description: "Créez bordereaux de livraison, provisoires et factures proforma sur votre papier entête",
        theme_color: "#1b3a2a",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // changeOrigin:false (le défaut Vite le met à true pour le ciblage
      // simple "/api": "url") : on préserve le Host d'origine
      // (localhost:5173) pour que request.build_absolute_uri() côté
      // Django renvoie des URLs de fichiers (papier entête, cachet)
      // rechargeables par le navigateur, pas "backend:8000" (nom Docker
      // interne, invisible hors du réseau docker-compose).
      "/api": { target: "http://backend:8000", changeOrigin: false },
      "/media": { target: "http://backend:8000", changeOrigin: false },
    },
  },
});
