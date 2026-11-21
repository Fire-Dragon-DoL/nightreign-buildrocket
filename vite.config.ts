import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// The build output must be ONE self-contained HTML file that works when opened
// over file:// in Chrome. Everything (JS, CSS, workers, data) is inlined.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  worker: {
    // Workers are imported with `?worker&inline` so they end up inside the
    // single HTML file instead of as separate assets.
    // MUST be 'iife' (classic worker): on file:// Chrome refuses to start a
    // *module* worker from a blob:null URL, while classic blob workers work
    // and still get crypto.subtle. Covered by e2e/app.spec.ts.
    format: 'iife',
  },
  build: {
    target: 'chrome120',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
