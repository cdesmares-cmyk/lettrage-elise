import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('xlsx')) return 'vendor-xlsx'
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('react') || id.includes('react-router') || id.includes('react-hot-toast')) return 'vendor-react'
          if (id.includes('papaparse') || id.includes('html2canvas') || id.includes('@tanstack')) return 'vendor-utils'
        },
      },
    },
  },
})
