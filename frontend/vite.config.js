import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev proxy is optional: set VITE_API_URL empty to call /api through the Vite server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_PROXY_TARGET || 'http://localhost:8080';
  if (mode === 'production') {
    const ws = (env.VITE_WS_URL || '').trim();
    if (!ws || !ws.startsWith('wss://')) {
      // CONTRACT_DECISIONS B6: the socket cannot go through a Vercel rewrite, so production needs an explicit wss:// URL.
      console.warn(`\n[pulse] WARNING: VITE_WS_URL is ${ws ? `"${ws}"` : 'empty'}. A production build needs an explicit wss://<api-host>/ws URL.\n`);
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/ws': { target, ws: true, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: false,
      testTimeout: 30000,
      hookTimeout: 30000,
    },
  };
});
