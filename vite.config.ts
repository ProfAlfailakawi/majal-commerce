import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      // The HMR websocket port is pinned to a MAJAL-specific value (overridable via
      // VITE_HMR_PORT) so it never collides with a sibling Vite project — e.g. «مِراس»
      // on Vite's default 24678 — which would otherwise silently break live reload.
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : { port: Number(process.env.VITE_HMR_PORT) || 24699 },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
