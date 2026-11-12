import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { interpretApiDevPlugin } from './server/vite-dev-plugin';

// `vite build --mode single` inlines JS, CSS and the font into one index.html
// (handy for sharing a static preview). The default build is a normal Vite build.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), interpretApiDevPlugin(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000 } : {},
  server: { allowedHosts: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
