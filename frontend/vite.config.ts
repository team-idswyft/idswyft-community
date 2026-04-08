import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    hmr: {
      port: 5173
    },
    watch: {
      usePolling: true,
      interval: 100
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    target: ['es2020', 'chrome87', 'firefox78', 'safari14', 'edge88'],
  },
  define: {
    'process.env': {},
  },
})