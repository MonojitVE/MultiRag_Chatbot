import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Admin panel build config
// Built output goes to default dist/ for Vercel
export default defineConfig({
  plugins: [react()],
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
