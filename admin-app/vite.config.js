import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Admin panel build config
// Built output goes to ../admin/ so FastAPI serves it at /admin
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: '../admin',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
