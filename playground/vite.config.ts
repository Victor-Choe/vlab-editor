import tailwindcss from "@tailwindcss/postcss"
import { defineConfig } from "vite"
export default defineConfig({
  base: process.env.PAGES_BASE_PATH ?? "/",
  server: { host: "0.0.0.0", port: 3005, strictPort: true },
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { exclude: ["vlab-editor"] },
  css: { postcss: { plugins: [tailwindcss()] } },
})
