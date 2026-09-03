import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Resolves __PUBLIC_ORIGIN__ in index.html.
 *
 * og:image has to be an absolute URL — most crawlers will not resolve a relative one
 * against the page — but the origin is only known per deployment. APP_URL already carries
 * it, so the build substitutes it here. With APP_URL unset the placeholder collapses to
 * an empty string, leaving a root-relative path: no broken literal in the markup, and
 * exactly the behaviour the file had before.
 */
function publicOriginPlugin() {
  const origin = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return {
    name: 'majal-public-origin',
    transformIndexHtml(html: string) {
      return html.replaceAll('__PUBLIC_ORIGIN__', origin);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), publicOriginPlugin()],
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
