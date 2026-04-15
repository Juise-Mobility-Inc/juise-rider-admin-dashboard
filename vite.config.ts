import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const proxyConfig = {
    "/auth-api": {
      target:
        env.VITE_AUTH_PROXY_TARGET ||
        "https://global-auth-service.kuhmute.net",
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/auth-api/, ""),
    },
    "/nebula-api": {
      target:
        env.VITE_NEBULA_PROXY_TARGET ||
        "https://nebula-user-server.kuhmute.net",
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/nebula-api/, ""),
    },
    "/hub-store-api": {
      target:
        env.VITE_HUB_STORE_PROXY_TARGET ||
        "https://hub-store-service.kuhmute.net",
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/hub-store-api/, ""),
    },
    "/kca-api": {
      target: env.VITE_KCA_PROXY_TARGET || "https://kca-proxy.kuhmute.net",
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/kca-api/, ""),
    },
  };

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: proxyConfig,
    },
    preview: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: proxyConfig,
    },
  };
});
