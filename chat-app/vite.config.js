import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Chat frontend build config
// Built output goes to ../frontend/ so FastAPI serves it at /
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
