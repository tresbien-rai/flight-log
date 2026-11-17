/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': src('core'),
      '@storage': src('storage'),
      '@app': src('app'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // The airport table is one ~3 MB chunk and must be available offline.
      // Fonts are bundled (never fetched from a CDN), so woff2 must be precached too.
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Flight Log',
        short_name: 'Flight Log',
        description: 'Personal pilot logbook',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1E5C48',
        background_color: '#F2F5F1',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    // Core and pure-function tests run in plain Node; only component tests get a DOM.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['src/app/**/*.test.tsx'],
          setupFiles: ['src/app/test/setup.ts'],
        },
      },
    ],
  },
});
