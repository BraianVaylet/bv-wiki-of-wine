/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': la nueva versión no se aplica sola; la app avisa y el usuario
      // actualiza con un toque (ver components/UpdatePrompt.tsx). Con
      // 'autoUpdate' la pestaña abierta seguía con el JS viejo hasta un
      // refresh manual, y un formulario a medio llenar podía perderse.
      registerType: 'prompt',
      injectRegister: 'auto',
      // El SW no se activa en dev ni en los tests (vitest usa este config).
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Wiki of Wine',
        short_name: 'BV Wiki of Wine',
        description: 'Los vinos que probamos, y si nos gustaron.',
        theme_color: '#1f1e1d',
        background_color: '#1f1e1d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
