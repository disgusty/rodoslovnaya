import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/**
 * Capacitor on Android injects its native bridge as an inline <script> into index.html,
 * so the Android build (`vite build --mode android`) has to allow inline scripts in the CSP.
 * The desktop build keeps the strict policy.
 */
const androidCsp = (): Plugin => ({
  name: 'android-csp',
  apply: (_config, env) => env.mode === 'android',
  transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
});

export default defineConfig({
  plugins: [react(), androidCsp()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 600 },
});
