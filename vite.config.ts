import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // The browser bundle never reads the server's secret-bearing .env file.
  envDir: false,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'brand-mark.svg'],
      manifest: {
        name: 'Spendime Personal Finance',
        short_name: 'Spendime',
        description: 'Private, utility-aware personal finance tracking.',
        theme_color: '#102a2c',
        background_color: '#f5f3ec',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
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
