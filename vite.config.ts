import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'Mindful Bite',
        short_name: 'MindfulBite',
        description: 'Mindful eating, mood, and sleep companion.',
        theme_color: '#1A1714',
        background_color: '#1A1714',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Web Push handlers (push + notificationclick) live in public/push-sw.js.
        importScripts: ['push-sw.js'],
        // Precache the app shell: JS, CSS, HTML, SVG and image assets.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Single-page-app fallback so deep links work offline.
        navigateFallback: '/index.html',
        // Never serve /api/* from the service worker — those must always hit network.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Explicitly bypass the cache for API calls (network only).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts stylesheets + webfonts.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            // react, react-dom, scheduler and other deps -> single vendor chunk
            return 'vendor'
          }
        },
      },
    },
  },
})
