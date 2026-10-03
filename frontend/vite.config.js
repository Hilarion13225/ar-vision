import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import httpsRedirect from './httpsRedirect.js'

// - `npm run dev`        : HTTPS auto-signé, accessible depuis le téléphone sur le même Wi-Fi.
// - `npm run dev:tunnel` : HTTP simple, à exposer en HTTPS via `ngrok http 5173`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useSelfSignedHttps = mode !== 'tunnel'

  return {
    plugins: [react(), useSelfSignedHttps && basicSsl(), useSelfSignedHttps && httpsRedirect()].filter(Boolean),
    server: {
      port: 5173,
      allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.ngrok-free.dev'],
      // Le front appelle /api en relatif : le proxy évite tout problème de contenu mixte
      // (page HTTPS -> API HTTP) et de CORS.
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000',
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
  }
})
