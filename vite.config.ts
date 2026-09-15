import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    // Der API-Server bindet nur auf localhost; der Dev-Server reicht /api
    // durch, damit das Frontend nie einen Port kennen oder CORS können muss.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8340',
        changeOrigin: false,
      },
    },
  },
})
