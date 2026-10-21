import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// Capacitor / Tauri load built assets from the local filesystem, so relative
// asset paths keep the same bundle working on every target.
export default defineConfig({
  base: './',
  // The About pane shows a version. Reading it from package.json here means a
  // release only has to bump one file for the app to report the right number,
  // instead of the string drifting quietly behind the shipped build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'The Recipe App',
        short_name: 'The Recipe App',
        description: 'Collect, import and organize your recipes.',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['food', 'lifestyle', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // The Tauri build writes thousands of .dll/.pdb files into
      // src-tauri/target while the dev server is running. Watching them
      // crashes the watcher with EBUSY on Windows (locked files), so the
      // Rust build directory is kept out of the watch set.
      ignored: ['**/src-tauri/target/**', '**/src-tauri/gen/**'],
    },
  },
})
