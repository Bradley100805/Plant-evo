import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets PAGES_BASE.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
});
