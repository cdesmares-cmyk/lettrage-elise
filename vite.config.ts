import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Configuration Vite — Lettrage Elise
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
