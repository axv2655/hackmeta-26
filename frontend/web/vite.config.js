import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The app calls its own origin (/api, /media), like the deployed build the backend serves.
  // In dev, Vite forwards those to the backend: BACKEND_URL, default the local one.
  const backend = loadEnv(mode, process.cwd(), '').BACKEND_URL || 'http://localhost:8000'
  const to = { target: backend, changeOrigin: true }
  return {
    plugins: [react()],
    server: { proxy: { '/api': { ...to, ws: true }, '/media': to } },
  }
})
