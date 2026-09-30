/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineConfig(({ mode }) => {
  // Reads frontend/.env, .env.local and process.env (process.env wins). No VITE_ prefix
  // needed: these values configure the dev server only and never reach the browser bundle.
  const env = loadEnv(mode, rootDir, '');
  const webPort = port(env.WEB_PORT, 5173);
  const apiPort = port(env.API_PORT, 4000);

  // Same-origin in development: the browser only talks to Vite, which forwards /api
  // (including the Origin header the backend's CSRF check relies on) to Express.
  const proxy = {
    '/api': { target: `http://localhost:${apiPort}` },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: webPort, strictPort: true, proxy },
    preview: { port: webPort, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  };
});
