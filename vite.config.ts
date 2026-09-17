import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // The browser bundle never reads the server's secret-bearing .env file.
  envDir: false,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-512-maskable.png',
        'brand-mark.svg',
      ],
      // Kept as a public file so Workbox cannot turn the web manifest into a
      // cache-first precache entry. Express gives it revalidation headers.
      manifest: false,
      workbox: {
        cacheId: 'spendime',
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigationPreload: true,
        importScripts: ['sw-cache-migration.js'],
        // HTML and the manifest must be fetched/revalidated rather than
        // becoming cache-first precache entries. Hashed assets stay precached.
        globIgnores: ['**/index.html', '**/manifest.webmanifest', '**/sw-cache-migration.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              url.origin === self.location.origin &&
              !url.pathname.startsWith('/api/') &&
              url.pathname !== '/health',
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'spendime-navigation-v2',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist/client',
    // Safe to clean this child directory; the server build lives in dist/src.
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
          if (id.includes('node_modules/@tanstack')) return 'query';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-router')) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
