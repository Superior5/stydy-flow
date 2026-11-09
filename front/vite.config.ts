import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const origin = new URL(env.APP_ORIGIN || "http://localhost:5173");
  return {
    plugins: [vue(), tailwindcss()],
    server: {
      port: Number(origin.port) || 5173,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${env.PORT || 3007}` },
    },
  };
});
