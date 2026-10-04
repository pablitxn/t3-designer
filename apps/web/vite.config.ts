import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: { __T3_BACKEND_ENABLED__: JSON.stringify(mode === 'full') },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    ...(mode === 'full' ? { proxy: { '/api': process.env.T3_API_PROXY_URL || 'http://127.0.0.1:8787' } } : {}),
  },
}))
