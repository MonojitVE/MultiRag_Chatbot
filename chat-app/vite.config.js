import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Chat frontend build config
// Built output goes to default dist/ for Vercel
export default defineConfig({
  plugins: [react()],
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
