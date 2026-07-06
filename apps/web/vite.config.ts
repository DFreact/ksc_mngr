import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/trpc': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // No CDN imports — all assets bundled locally
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          query: ['@tanstack/react-query'],
          trpc: ['@trpc/client', '@trpc/react-query'],
        },
      },
    },
  },
})
