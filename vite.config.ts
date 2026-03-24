import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT || 5174),
      proxy: {
        '/auth-api': {
          target: env.VITE_AUTH_PROXY_TARGET || 'http://localhost:3864',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/auth-api/, ''),
        },
        '/nebula-api': {
          target: env.VITE_NEBULA_PROXY_TARGET || 'http://localhost:7893',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/nebula-api/, ''),
        },
        '/hub-store-api': {
          target: env.VITE_HUB_STORE_PROXY_TARGET || 'http://localhost:9635',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hub-store-api/, ''),
        },
      },
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4174),
    },
  }
})
