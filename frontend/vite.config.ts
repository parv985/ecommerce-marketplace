import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Allow preview/proxy hosts (e.g. sandbox previews) in addition to
    // localhost so the dev server is reachable when hosted remotely.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[vite proxy error]', err.message)
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
              })
              res.end(
                JSON.stringify({
                  success: false,
                  message: 'Backend server is temporarily unavailable or restarting. Please retry.',
                  code: 'BACKEND_UNAVAILABLE',
                })
              )
            }
          })
        },
      },
    },
  },
})
