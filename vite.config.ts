import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const envTarget = (key: string, fallback: string) =>
    env[key]?.trim() || fallback;

  const proxyConfig = {
    "/kca-api": {
      target: envTarget(
        "VITE_KCA_PROXY_TARGET",
        "https://kca-proxy.juisemobility.com",
      ),
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
