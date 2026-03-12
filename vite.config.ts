import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { financeDevApiPlugin } from './electron/dev-api-plugin'

// Konfiguracja dla `npm run dev` (plain Vite, bez Electrona).
// electron.vite.config.ts jest używany tylko przez electron-vite (build + .exe).
export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@renderer': resolve('src'),
    },
  },
  plugins: [react(), financeDevApiPlugin()],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      input: resolve('index.html'),
    },
  },
})
